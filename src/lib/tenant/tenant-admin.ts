import type { Tenant, TenantStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { runDbTx } from "@/lib/prisma/tx";
import { TenantCache } from "@/lib/cache/tenant-cache";
import { eventBus } from "@/lib/events/event-bus";
import { AppError } from "@/lib/http/errors";
import { TenantResolver } from "@/lib/tenant/resolver";

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

    const updated = await prismaUnscoped.tenant.update({
      where: { id: tenantId },
      data: { status: newStatus },
    });

    // Invalidate cached snapshots so gate logic picks the new status instantly.
    await TenantCache.invalidate(updated.id, updated.slug);

    eventBus.emit("tenant.status_changed", {
      tenantId: updated.id,
      actorUserId,
      from: tenant.status,
      to: newStatus,
      reason,
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
}