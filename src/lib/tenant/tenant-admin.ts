import type { Tenant, TenantStatus, TenantType } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { runDbTx } from "@/lib/prisma/tx";
import { TenantCache } from "@/lib/cache/tenant-cache";
import { eventBus } from "@/lib/events/event-bus";
import { AppError } from "@/lib/http/errors";
import { TenantResolver } from "@/lib/tenant/resolver";
import { slugify } from "@/lib/properties/seo";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * Platform service for tenant lifecycle operations (MASTER-only actions,
 * enforced at the route layer via RBAC).
 */

export interface ChangeTenantStatusInput {
  tenantId: string;
  newStatus: TenantStatus;
  actorUserId: string | null;
  reason?: string;
}

export class TenantAdminService {
  /** Change a tenant's status; emits domain event → audit logging. */
  static async changeStatus({
    tenantId,
    newStatus,
    actorUserId,
    reason,
  }: ChangeTenantStatusInput): Promise<Tenant> {
    const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found.");
    }
    if (tenant.status === newStatus) return tenant; // no-op

    // Manual (ops) lockout semantics: a BLOCKED transition stamps the lockout
    // so a later webhook payment can never silently unblock it; an operator
    // unblock is the ONLY thing that clears it (and the stored reason).
    const blocking = newStatus === "BLOCKED";
    const now = new Date();
    const updated = await prismaUnscoped.tenant.update({
      where: { id: tenantId },
      data: {
        status: newStatus,
        manualBlockedAt: blocking
          ? now
          : tenant.manualBlockedAt
            ? null
            : undefined,
        blockReason: blocking
          ? (reason ?? "Bloqueio manual pela operação")
          : tenant.manualBlockedAt
            ? null
            : undefined,
      },
    });

    // Keep the derived subscription row in sync so the billing console reads
    // one coherent lifecycle (data is never touched — status flip only).
    const subscription = await prismaUnscoped.tenantSubscription.findUnique({
      where: { tenantId },
    });
    if (subscription) {
      await prismaUnscoped.tenantSubscription.update({
        where: { id: subscription.id },
        data: {
          status: newStatus,
          blockedAt: blocking ? now : undefined,
          cancelledAt: newStatus === "CANCELLED" ? now : undefined,
        },
      });
    }

    // Invalidate cached snapshots so gate logic picks the new status instantly.
    await TenantCache.invalidate(updated.id, updated.slug);

    eventBus.emit("tenant.status_changed", {
      tenantId: updated.id,
      actorUserId,
      from: tenant.status,
      to: newStatus,
      reason: blocking
        ? `manual:${reason ?? "bloqueio manual"}`
        : reason,
    });

    return updated;
  }

  /** Create a tenant + bootstrap its owner account (self-service signup/console). */
  static async createTenant(input: {
    name: string;
    slug: string;
    planId: string;
    owner: { name: string; email: string; passwordHash: string };
  }): Promise<{ tenant: Tenant; ownerId: string }> {
    const existingSlug = await TenantResolver.resolveBySlug(input.slug);
    if (existingSlug) {
      throw new AppError(409, "TENANT_EXISTS", "This tenant slug is already taken.");
    }

    const result = await runDbTx(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: input.name,
          slug: input.slug,
          planId: input.planId,
        },
      });
      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: input.owner.name,
          email: input.owner.email,
          passwordHash: input.owner.passwordHash,
          role: "OWNER",
        },
      });
      return { tenant, ownerId: owner.id };
    });

    await TenantCache.set(result.tenant);
    return result;
  }

  // --- Item 3: Cadastro de imobiliárias e corretores --------------------------

  /** Self-service tenant registration (imobiliária / corretor autônomo). */
  static async registerTenant(input: {
    type: TenantType;
    displayName: string;
    legalName?: string | null;
    document: string;
    creci?: string | null;
    responsibleName: string;
    phone: string;
    whatsapp?: string | null;
    email: string;
    passwordHash: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    description?: string | null;
    website?: string | null;
    socialLinks?: Record<string, string | null | undefined>;
  }): Promise<{ tenant: Tenant; ownerId: string }> {
    // Uniqueness guards BEFORE the tx so 409s surface as AppErrors, not P2002.
    if (await prismaUnscoped.user.findUnique({ where: { email: input.email } })) {
      throw new AppError(409, "EMAIL_TAKEN", "Este e-mail já está cadastrado.");
    }

    const slug = await this.availableSlug(input.displayName);

    const plan = await prismaUnscoped.plan.findFirst({
      where: { isActive: true },
      orderBy: { priceCents: "asc" },
    });
    if (!plan) {
      throw new AppError(500, "NO_ACTIVE_PLAN", "Nenhum plano disponível para cadastro.");
    }

    const result = await runDbTx(async (tx) => {
      const socialCleaned = Object.fromEntries(
        Object.entries(input.socialLinks ?? {}).filter(([, v]) => v && String(v).trim() !== ""),
      );
      const tenant = await tx.tenant.create({
        data: {
          name: input.displayName,
          slug,
          type: input.type,
          planId: plan.id,
          status: "TRIAL",
          legalName: input.legalName ?? null,
          document: input.document,
          creci: input.creci ?? null,
          responsibleName: input.responsibleName,
          phone: input.phone,
          whatsapp: input.whatsapp ?? input.phone,
          contactEmail: input.email,
          address: input.address ?? null,
          city: input.city ?? null,
          state: input.state ? input.state.toUpperCase() : null,
          description: input.description ?? null,
          website: input.website ?? null,
          socialLinks: Object.keys(socialCleaned).length > 0 ? socialCleaned : null,
        } as never,
      });

      const owner = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: input.responsibleName,
          email: input.email,
          passwordHash: input.passwordHash,
          role: "OWNER",
          phone: input.phone,
          whatsapp: input.whatsapp ?? input.phone,
          creci: input.creci ?? null,
          document: input.type === "BROKER" ? input.document : null,
        },
      });

      // Bootstrap the TRIAL subscription (FREE default plan) so the billing
      // engine and the Master console operate on the subscriber immediately.
      const trialEndsAt = new Date(Date.now() + (plan.trialDays || 14) * 86_400_000);
      await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          provider: "CUSTOM",
          status: "TRIAL",
          priceCents: plan.priceCents,
          billingCycle: plan.billingCycle,
          trialEndsAt,
          currentPeriodStart: new Date(),
          currentPeriodEnd: trialEndsAt,
        },
      });

      return { tenant, ownerId: owner.id };
    });

    await TenantCache.set(result.tenant);

    // Audit on user/tenant — tenant binding is implicit (the new tenant).
    await AuditService.log({
      tenantId: result.tenant.id,
      userId: result.ownerId,
      action: AUDIT_ACTIONS.TENANT_REGISTERED,
      entity: "Tenant",
      entityId: result.tenant.id,
      details: { type: input.type, email: input.email, slug: result.tenant.slug },
    });

    return result;
  }

  private static async availableSlug(displayName: string): Promise<string> {
    const base = slugify(displayName) || "imobiliaria";
    let candidate = base;
    let i = 2;
    while (await TenantResolver.resolveBySlug(candidate)) {
      candidate = `${base}-${i++}`;
    }
    return candidate;
  }

  /** Full registration profile for the tenant + its owner (self-service read). */
  static async getProfile(tenantId: string, userId: string) {
    const tenant = await prismaUnscoped.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: { select: { code: true, name: true } } },
    });
    if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found.");
    const owner = await prismaUnscoped.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        document: true,
        creci: true,
        photoUrl: true,
        whatsapp: true,
      },
    });
    return { tenant, owner };
  }

  /** Partial update of tenant + owner registration fields (self-service). */
  static async updateProfile(
    tenantId: string,
    userId: string,
    data: {
      tenant?: Record<string, unknown>;
      broker?: Record<string, unknown>;
    },
  ): Promise<{ tenant: Tenant; userId: string }> {
    const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found.");

    const allowedTenant = [
      "name",
      "legalName",
      "document",
      "creci",
      "responsibleName",
      "phone",
      "whatsapp",
      "contactEmail",
      "address",
      "city",
      "state",
      "logoUrl",
      "description",
      "website",
      "socialLinks",
    ];
    const tenantPatch: Record<string, unknown> = {};
    if (data.tenant) {
      for (const key of Object.keys(data.tenant)) {
        if (allowedTenant.includes(key)) tenantPatch[key] = (data.tenant as Record<string, unknown>)[key];
      }
      // Registration form sends "displayName" for the tenant's name — map it.
      if ("displayName" in (data.tenant as Record<string, unknown>)) {
        tenantPatch["name"] = (data.tenant as Record<string, unknown>)["displayName"];
      }
      if (tenantPatch["state"]) tenantPatch["state"] = String(tenantPatch["state"]).toUpperCase();
      if (tenantPatch["socialLinks"] != null && typeof tenantPatch["socialLinks"] === "object") {
        const cleaned = Object.fromEntries(
          Object.entries(tenantPatch["socialLinks"] as Record<string, unknown>).filter(
            ([, v]) => v != null && String(v).trim() !== "",
          ),
        );
        tenantPatch["socialLinks"] = Object.keys(cleaned).length > 0 ? cleaned : null;
      }
    }

    const allowedBroker = ["name", "document", "creci", "phone", "whatsapp", "photoUrl"];
    const brokerPatch: Record<string, unknown> = {};
    if (data.broker) {
      for (const key of Object.keys(data.broker)) {
        if (allowedBroker.includes(key)) brokerPatch[key] = (data.broker as Record<string, unknown>)[key];
      }
    }

    const updated = await prismaUnscoped.tenant.update({
      where: { id: tenantId },
      data: tenantPatch as never,
    });

    if (Object.keys(brokerPatch).length > 0) {
      await prismaUnscoped.user.update({
        where: { id: userId },
        data: brokerPatch as never,
      });
    }

    await TenantCache.invalidate(updated.id, updated.slug);

    await AuditService.log({
      tenantId,
      userId,
      action: AUDIT_ACTIONS.TENANT_PROFILE_UPDATED,
      entity: "Tenant",
      entityId: tenantId,
      details: { fields: Object.keys(tenantPatch).concat(Object.keys(brokerPatch)) },
    });

    return { tenant: updated, userId };
  }
}