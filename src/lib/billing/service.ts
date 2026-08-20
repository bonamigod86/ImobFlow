import type { BillingProvider, Plan, TenantSubscription } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { runDbTx } from "@/lib/prisma/tx";
import { TenantCache } from "@/lib/cache/tenant-cache";
import { AppError } from "@/lib/http/errors";
import { ingestProviderWebhook } from "@/lib/billing/billing-events";
import { hmacHex } from "@/lib/billing/gateway/verify";
import { env } from "@/lib/config/env";
import { eventBus } from "@/lib/events/event-bus";
import type { BillingEventType } from "@/lib/billing/types";
import "../events/register";

/**
 * Billing service — tenant-facing provisioning and the dev/integration
 * "custom gateway" simulation surface (also used by the seed to exercise the
 * real webhook pipeline instead of writing rows directly).
 *
 * Money discipline: every amount is integer cents; the provider snapshot is
 * taken at provisioning time and never re-derived from the live plan.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function advanceCycle(from: Date, cycle: "MONTHLY" | "YEARLY"): Date {
  const d = new Date(from);
  if (cycle === "YEARLY") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function token(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Full billing picture for a tenant (subscription + invoices + notifications). */
export async function getTenantBilling(tenantId: string) {
  const tenant = await prismaUnscoped.tenant.findUnique({
    where: { id: tenantId },
    include: {
      plan: true,
      planOverridePlan: true,
      subscription: { include: { plan: true } },
    },
  });
  if (!tenant) {
    throw new AppError(404, "TENANT_NOT_FOUND", "Tenant não encontrado.");
  }

  const [invoices, notifications, highlightBalance] = await Promise.all([
    prismaUnscoped.paymentInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prismaUnscoped.billingNotification.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prismaUnscoped.highlightCreditLedger.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { balanceAfter: true },
    }),
  ]);

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      manualBlockedAt: tenant.manualBlockedAt,
      blockReason: tenant.blockReason,
      plan: tenant.planOverridePlan ?? tenant.plan,
      planOverride: tenant.planOverridePlan ? true : false,
    },
    subscription: tenant.subscription,
    invoices,
    notifications,
    highlightBalance: highlightBalance?.balanceAfter ?? 0,
  };
}

/**
 * Provision (or re-provision) a tenant's subscription. Idempotent: returns the
 * existing row when the tenant already has one unless `force` is set (used by
 * the Master Admin to re-provision onto another plan).
 */
export async function provisionSubscription(input: {
  tenantId: string;
  planCode: string;
  provider?: BillingProvider;
  trialDays?: number;
  force?: boolean;
}): Promise<TenantSubscription | null> {
  const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) {
    throw new AppError(404, "TENANT_NOT_FOUND", "Tenant não encontrado.");
  }
  const plan = await prismaUnscoped.plan.findUnique({ where: { code: input.planCode } });
  if (!plan || !plan.isActive) {
    throw new AppError(404, "PLAN_NOT_FOUND", `Plano "${input.planCode}" não encontrado ou inativo.`);
  }

  const existing = await prismaUnscoped.tenantSubscription.findUnique({
    where: { tenantId: tenant.id },
  });
  if (existing && !input.force) {
    return existing;
  }

  const trialDays = input.trialDays ?? plan.trialDays;
  const today = new Date();
  const trialEndsAt = trialDays > 0 ? new Date(today.getTime() + trialDays * DAY_MS) : null;
  const periodEnd = trialEndsAt ?? advanceCycle(today, plan.billingCycle);

  const subscription = await runDbTx(async (tx) => {
    const row = await tx.tenantSubscription.upsert({
      where: { tenantId: tenant.id },
      update:
        existing && input.force
          ? {
              planId: plan.id,
              provider: input.provider ?? existing.provider,
              status: trialEndsAt ? "TRIAL" : "ACTIVE",
              priceCents: plan.priceCents,
              billingCycle: plan.billingCycle,
              trialEndsAt,
              currentPeriodStart: today,
              currentPeriodEnd: periodEnd,
              nextInvoiceDueAt: periodEnd,
              graceEndsAt: null,
              blockedAt: null,
              cancelledAt: null,
            }
          : {},
      create: {
        tenantId: tenant.id,
        planId: plan.id,
        provider: input.provider ?? "CUSTOM",
        status: trialEndsAt ? "TRIAL" : "ACTIVE",
        priceCents: plan.priceCents,
        billingCycle: plan.billingCycle,
        trialEndsAt,
        currentPeriodStart: today,
        currentPeriodEnd: periodEnd,
        nextInvoiceDueAt: periodEnd,
        providerCustomerId: token("cus"),
        providerSubscriptionId: token("sub"),
      },
    });

    // First invoice: due at trial end (or immediately when there is no trial).
    const hasOpen = await tx.paymentInvoice.findFirst({
      where: { tenantId: tenant.id, status: { in: ["OPEN", "OVERDUE"] } },
    });
    if (!hasOpen) {
      await tx.paymentInvoice.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: row.id,
          amountCents: plan.priceCents,
          status: "OPEN",
          dueDate: periodEnd,
        },
      });
    }

    return row;
  });

  // Keep the tenant's plan pointer in sync (plan overrides win when active).
  if (!tenant.planOverridePlanId) {
    const updatedTenant = await prismaUnscoped.tenant.update({
      where: { id: tenant.id },
      data: { planId: plan.id, status: trialEndsAt ? "TRIAL" : "ACTIVE" },
    });
    await TenantCache.set(updatedTenant);
  }

  eventBus.emit("billing.subscription.provisioned", {
    tenantId: tenant.id,
    subscriptionId: subscription.id,
    planCode: plan.code,
    planName: plan.name,
    priceCents: plan.priceCents,
    billingCycle: plan.billingCycle,
    trialDays: trialDays > 0 ? trialDays : 0,
  });

  return subscription;
}

/**
 * Push a synthetic provider event through the REAL webhook pipeline (adapter
 * verify + normalize + idempotency + state machine). The custom gateway
 * convention is used: `x-webhook-signature` HMAC over the raw body.
 */
export async function simulateProviderEvent(input: {
  tenantId: string;
  type: BillingEventType | "unhandled";
  overrides?: Record<string, unknown>;
}): Promise<{ outcomes: Awaited<ReturnType<typeof ingestProviderWebhook>>["outcomes"] }> {
  const subscription = await prismaUnscoped.tenantSubscription.findUnique({
    where: { tenantId: input.tenantId },
  });
  if (!subscription) {
    throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", "Tenant sem assinatura — provisione primeiro.");
  }

  const base: Record<string, unknown> = {
    id: token("evt"),
    type: input.type,
    tenantId: input.tenantId,
    subscriptionId: subscription.providerSubscriptionId,
    customerId: subscription.providerCustomerId,
  };
  const payload = { ...base, ...input.overrides };
  const rawBody = JSON.stringify(payload);
  const signature = hmacHex(env.CUSTOM_WEBHOOK_SECRET, rawBody);

  const headers = new Headers();
  headers.set("x-webhook-signature", signature);
  headers.set("content-type", "application/json");

  const result = await ingestProviderWebhook({
    provider: "CUSTOM",
    rawBody,
    headers,
  });
  return { outcomes: result.outcomes };
}

/** Plan lookup helper shared by routes (returns the raw Prisma row). */
export async function findPlanByCode(code: string): Promise<Plan | null> {
  return prismaUnscoped.plan.findUnique({ where: { code } });
}