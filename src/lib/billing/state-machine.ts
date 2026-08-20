import type {
  BillingProvider,
  PaymentInvoiceStatus,
  Plan,
  Prisma,
  Tenant,
  TenantStatus,
} from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { TenantCache } from "@/lib/cache/tenant-cache";
import { eventBus } from "@/lib/events/event-bus";
import type {
  BillingEventOutcome,
  NormalizedBillingEvent,
} from "@/lib/billing/types";
import { grantPlanAllotment, creditHighlights } from "@/lib/billing/highlights";
import { runDbTx } from "@/lib/prisma/tx";
import { env } from "@/lib/config/env";
import "../events/register";

/**
 * Billing state machine — the single authority over subscription lifecycle.
 *
 * Provider webhooks are normalized (gateway adapters) and applied HERE. Every
 * transition keeps both the subscription row and the derived `Tenant.status`
 * in sync, re-emits domain events (audit subscribers live in events/register),
 * and preserves all tenant data (suspension is a status flip, never a delete).
 *
 * Guardrails:
 *   - `Tenant.manualBlockedAt` is an ops lockout that survives webhooks: a paid
 *     invoice never silently unblocks a manually-blocked tenant.
 *   - Idempotency is enforced by the caller (unique providerEventId), so these
 *     handlers may assume each invoice/subscription event arrives once.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

export interface SubscriptionResolution {
  subscription: NonNullable<Awaited<ReturnType<typeof findSubscription>>>;
  tenant: Tenant & { plan: Plan };
}

async function findSubscription(event: NormalizedBillingEvent) {
  if (event.providerSubscriptionId) {
    const byProvider = await prismaUnscoped.tenantSubscription.findUnique({
      where: { providerSubscriptionId: event.providerSubscriptionId },
    });
    if (byProvider) {
      return prismaUnscoped.tenantSubscription.findFirst({
        where: { id: byProvider.id },
        include: { tenant: { include: { plan: true } }, plan: true },
      });
    }
  }
  if (event.tenantId) {
    return prismaUnscoped.tenantSubscription.findUnique({
      where: { tenantId: event.tenantId },
      include: { tenant: { include: { plan: true } }, plan: true },
    });
  }
  if (event.customerId) {
    return prismaUnscoped.tenantSubscription.findUnique({
      where: { providerCustomerId: event.customerId },
      include: { tenant: { include: { plan: true } }, plan: true },
    });
  }
  return null;
}

async function loadResolution(event: NormalizedBillingEvent): Promise<SubscriptionResolution | null> {
  const subscription = await findSubscription(event);
  if (!subscription) return null;
  return { subscription, tenant: subscription.tenant as Tenant & { plan: Plan } };
}

/** Grace window in days: plan setting wins, else the global env default. */
function graceDays(plan: { gracePeriodDays: number }): number {
  return plan.gracePeriodDays > 0 ? plan.gracePeriodDays : env.BILLING_GRACE_DAYS;
}

/**
 * Apply a derived tenant status, honoring the manual ops lockout. Invalidates
 * the hot-path cache so the API wrapper picks the new status immediately.
 */
async function syncTenantStatus(
  tx: Tx,
  tenant: Tenant,
  to: TenantStatus,
): Promise<void> {
  const effective: TenantStatus = tenant.manualBlockedAt ? "BLOCKED" : to;
  if (tenant.status === effective) return;
  const updated = await tx.tenant.update({
    where: { id: tenant.id },
    data: { status: effective },
  });
  await TenantCache.invalidate(updated.id, updated.slug);
  eventBus.emit("tenant.status_changed", {
    tenantId: updated.id,
    actorUserId: null,
    from: tenant.status,
    to: effective,
    reason: `billing:${effective}`,
  });
}

async function upsertInvoice(tx: Tx, input: {
  tenantId: string;
  subscriptionId: string | null;
  providerInvoiceId?: string;
  amountCents: number;
  status: PaymentInvoiceStatus;
  dueDate: Date;
  paidAt?: Date;
  attemptsDelta?: number;
  metadata?: unknown;
}): Promise<{ id: string; providerInvoiceId: string | null; status: PaymentInvoiceStatus; paidAt: Date | null }> {
  const { providerInvoiceId, ...rest } = input;
  const row = await tx.paymentInvoice.findFirst({
    where: providerInvoiceId
      ? { providerInvoiceId }
      : { tenantId: input.tenantId, subscriptionId: input.subscriptionId, status: "OPEN" },
  });
  if (row) {
    return tx.paymentInvoice.update({
      where: { id: row.id },
      data: {
        status: input.status,
        paidAt: input.paidAt ?? row.paidAt,
        amountCents: input.amountCents > 0 ? input.amountCents : row.amountCents,
        dueDate: input.dueDate,
        attempts: row.attempts + (input.attemptsDelta ?? 0),
        metadata: (input.metadata as Prisma.InputJsonValue) ?? row.metadata ?? undefined,
      },
    });
  }
  return tx.paymentInvoice.create({
    data: {
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId ?? undefined,
      providerInvoiceId,
      amountCents: input.amountCents,
      status: input.status,
      dueDate: input.dueDate,
      paidAt: input.paidAt,
      attempts: input.attemptsDelta ?? 0,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

async function recordNotification(tx: Tx, input: {
  tenantId: string;
  subscriptionId: string | null;
  kind: "PRE_DUE" | "PAYMENT_FAILED" | "GRACE_EXPIRED" | "REACTIVATED";
  dueDate: Date;
  payload?: unknown;
}): Promise<void> {
  const { tenantId, subscriptionId, kind, dueDate, payload } = input;
  await tx.billingNotification.upsert({
    where: { tenantId_kind_dueDate: { tenantId, kind, dueDate } },
    update: {},
    create: {
      tenantId,
      subscriptionId: subscriptionId ?? undefined,
      kind,
      dueDate,
      payload: (payload as Prisma.InputJsonValue) ?? undefined,
    },
  });
  eventBus.emit("billing.dunning.notified", {
    tenantId,
    subscriptionId: subscriptionId ?? null,
    kind,
    dueDate: dueDate.toISOString(),
  });
}

// --- Event handlers (one per canonical type) --------------------------------

export async function handleInvoicePaid(
  event: NormalizedBillingEvent,
): Promise<BillingEventOutcome> {
  const resolution = await loadResolution(event);
  if (!resolution) {
    return { eventId: event.providerEventId, type: event.type, processed: false, tenantId: null, action: "orphan" };
  }
  const { subscription, tenant } = resolution;
  const amountCents = event.amountCents ?? subscription.priceCents;
  const paidAt = event.paidAt ? new Date(event.paidAt) : new Date();

  const result = await runDbTx(async (tx) => {
    const invoice = await upsertInvoice(tx, {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      providerInvoiceId: event.providerInvoiceId,
      amountCents,
      status: "PAID",
      dueDate: event.dueDate ? new Date(event.dueDate) : new Date(),
      paidAt,
    });

    const periodStart = event.periodStart ? new Date(event.periodStart) : new Date();
    const periodEnd = event.periodEnd
      ? new Date(event.periodEnd)
      : advancePeriod(periodStart, subscription.billingCycle);

    const wasRestricted = subscription.status === "PAST_DUE" || subscription.status === "BLOCKED";

    const updated = await tx.tenantSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        lastPaymentAt: paidAt,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextInvoiceDueAt: periodEnd,
        graceEndsAt: null,
        blockedAt: null,
      },
    });

    await syncTenantStatus(tx, tenant, "ACTIVE");

    // Renewable entitlement: each paid period chips in the plan's highlight
    // credits (also covers reactivation after a hard lock).
    await grantPlanAllotment(tx, tenant.id, subscription.planId, subscription.plan.highlightCredits);

    eventBus.emit("billing.invoice.paid", {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      invoiceId: event.providerInvoiceId ?? null,
      amountCents,
      paidAt: paidAt.toISOString(),
    });

    if (wasRestricted) {
      await recordNotification(tx, {
        tenantId: tenant.id,
        subscriptionId: updated.id,
        kind: "REACTIVATED",
        dueDate: new Date(),
        payload: { invoiceId: event.providerInvoiceId, amountCents },
      });
      eventBus.emit("billing.subscription.reactivated", {
        tenantId: tenant.id,
        subscriptionId: updated.id,
        invoiceId: event.providerInvoiceId ?? null,
        amountCents,
        paidAt: paidAt.toISOString(),
      });
    }
    return invoice;
  });

  return {
    eventId: event.providerEventId,
    type: event.type,
    processed: true,
    tenantId: tenant.id,
    action: result.status === "PAID" ? "invoice_paid" : "invoice_updated",
  };
}

export async function handleInvoicePaymentFailed(
  event: NormalizedBillingEvent,
): Promise<BillingEventOutcome> {
  const resolution = await loadResolution(event);
  if (!resolution) {
    return { eventId: event.providerEventId, type: event.type, processed: false, tenantId: null, action: "orphan" };
  }
  const { subscription, tenant } = resolution;
  const amountCents = event.amountCents ?? subscription.priceCents;
  const dueDate = event.dueDate ? new Date(event.dueDate) : new Date();

  const result = await runDbTx(async (tx) => {
    await upsertInvoice(tx, {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      providerInvoiceId: event.providerInvoiceId,
      amountCents,
      status: "OVERDUE",
      dueDate,
      attemptsDelta: 1,
    });

    if (subscription.status === "BLOCKED" || subscription.status === "CANCELLED") {
      return { progressed: false };
    }

    const graceEndsAt = new Date(Date.now() + graceDays(subscription.plan) * DAY_MS);
    const progressed = subscription.status !== "PAST_DUE";
    const updated = await tx.tenantSubscription.update({
      where: { id: subscription.id },
      data: {
        status: "PAST_DUE",
        graceEndsAt,
        nextInvoiceDueAt: dueDate,
      },
    });

    await syncTenantStatus(tx, tenant, "PAST_DUE");

    await recordNotification(tx, {
      tenantId: tenant.id,
      subscriptionId: updated.id,
      kind: "PAYMENT_FAILED",
      dueDate,
      payload: { amountCents, graceEndsAt: graceEndsAt.toISOString() },
    });

    eventBus.emit("billing.subscription.past_due", {
      tenantId: tenant.id,
      subscriptionId: updated.id,
      amountCents,
      graceEndsAt: graceEndsAt.toISOString(),
    });

    return { progressed };
  });

  return {
    eventId: event.providerEventId,
    type: event.type,
    processed: true,
    tenantId: tenant.id,
    action: result.progressed ? "subscription_past_due" : "already_restricted",
  };
}

export async function handleSubscriptionUpdated(
  event: NormalizedBillingEvent,
): Promise<BillingEventOutcome> {
  const resolution = await loadResolution(event);
  if (!resolution) {
    return { eventId: event.providerEventId, type: event.type, processed: false, tenantId: null, action: "orphan" };
  }
  const { subscription, tenant } = resolution;

  await runDbTx(async (tx) => {
    const mapped = mapProviderStatus(event.providerStatus);
    const data: Prisma.TenantSubscriptionUpdateInput = {
      providerRaw: event.raw as Prisma.InputJsonValue,
    };
    if (event.providerSubscriptionId) {
      data.providerSubscriptionId = event.providerSubscriptionId;
    }
    if (event.periodStart) data.currentPeriodStart = new Date(event.periodStart);
    if (event.periodEnd) data.currentPeriodEnd = new Date(event.periodEnd);
    if (mapped) data.status = mapped;

    const updated = await tx.tenantSubscription.update({ where: { id: subscription.id }, data });

    if (mapped && mapped !== "ACTIVE") {
      await syncTenantStatus(tx, tenant, mapped);
      if (mapped === "CANCELLED") {
        await tx.tenantSubscription.update({
          where: { id: subscription.id },
          data: { cancelledAt: event.paidAt ? new Date(event.paidAt) : new Date() },
        });
        eventBus.emit("billing.subscription.cancelled", {
          tenantId: tenant.id,
          subscriptionId: updated.id,
          cancelledAt: new Date().toISOString(),
        });
      }
    }
  });

  return {
    eventId: event.providerEventId,
    type: event.type,
    processed: true,
    tenantId: tenant.id,
    action: "subscription_synced",
  };
}

export async function handleSubscriptionDeleted(
  event: NormalizedBillingEvent,
): Promise<BillingEventOutcome> {
  const resolution = await loadResolution(event);
  if (!resolution) {
    return { eventId: event.providerEventId, type: event.type, processed: false, tenantId: null, action: "orphan" };
  }
  const { subscription, tenant } = resolution;
  const cancelledAt = new Date();

  await runDbTx(async (tx) => {
    await tx.tenantSubscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELLED", cancelledAt },
    });
    await syncTenantStatus(tx, tenant, "CANCELLED");
  });

  eventBus.emit("billing.subscription.cancelled", {
    tenantId: tenant.id,
    subscriptionId: subscription.id,
    cancelledAt: cancelledAt.toISOString(),
  });

  return {
    eventId: event.providerEventId,
    type: event.type,
    processed: true,
    tenantId: tenant.id,
    action: "subscription_cancelled",
  };
}

export async function handleCheckoutCompleted(
  event: NormalizedBillingEvent,
): Promise<BillingEventOutcome> {
  // Highlight add-on: confirm the PENDING purchase, credit the ledger.
  if (event.metadataKind === "highlight_credits") {
    const purchase = await resolveHighlightPurchase(event);
    if (purchase) {
      await confirmHighlightPurchase(purchase.id);
      return {
        eventId: event.providerEventId,
        type: event.type,
        processed: true,
        tenantId: purchase.tenantId,
        action: "highlight_credits_credited",
      };
    }
    return {
      eventId: event.providerEventId,
      type: event.type,
      processed: false,
      tenantId: event.tenantId ?? null,
      action: "purchase_not_found",
    };
  }

  // Subscription first/renewal payment.
  const resolution = await loadResolution(event);
  if (!resolution) {
    return { eventId: event.providerEventId, type: event.type, processed: false, tenantId: null, action: "orphan" };
  }
  const { subscription, tenant } = resolution;
  await runDbTx(async (tx) => {
    await tx.tenantSubscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", lastPaymentAt: event.paidAt ? new Date(event.paidAt) : new Date() },
    });
    await syncTenantStatus(tx, tenant, "ACTIVE");
    await grantPlanAllotment(tx, tenant.id, subscription.planId, subscription.plan.highlightCredits);
    eventBus.emit("billing.invoice.paid", {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      invoiceId: event.providerInvoiceId ?? null,
      amountCents: event.amountCents ?? subscription.priceCents,
      paidAt: new Date().toISOString(),
    });
  });

  return {
    eventId: event.providerEventId,
    type: event.type,
    processed: true,
    tenantId: tenant.id,
    action: "subscription_activated",
  };
}

// --- Highlight checkout helpers (used by handleCheckoutCompleted) ------------

async function resolveHighlightPurchase(event: NormalizedBillingEvent) {
  const meta = asRecord(asRecord(event.raw)?.metadata);
  const purchaseId = typeof meta?.purchaseId === "string" ? meta.purchaseId : undefined;
  if (purchaseId) {
    return prismaUnscoped.highlightPurchase.findUnique({ where: { id: purchaseId } });
  }
  if (event.providerInvoiceId) {
    return prismaUnscoped.highlightPurchase.findUnique({
      where: { providerPaymentId: event.providerInvoiceId },
    });
  }
  return null;
}

export async function confirmHighlightPurchase(purchaseId: string): Promise<{
  id: string;
  tenantId: string;
  creditsBought: number;
}> {
  const purchase = await prismaUnscoped.highlightPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) {
    throw new Error(`Highlight purchase ${purchaseId} not found.`);
  }
  if (purchase.status === "PAID") {
    return { id: purchase.id, tenantId: purchase.tenantId, creditsBought: purchase.creditsBought };
  }

  await runDbTx(async (tx) => {
    await tx.highlightPurchase.update({
      where: { id: purchase.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    await creditHighlights(tx, purchase.tenantId, {
      kind: "TOPUP",
      amount: purchase.creditsBought,
      purchaseId: purchase.id,
      note: `Compra de ${purchase.creditsBought} crédito(s) de destaque`,
    });
  });

  eventBus.emit("billing.highlight.purchased", {
    tenantId: purchase.tenantId,
    purchaseId: purchase.id,
    credits: purchase.creditsBought,
    totalAmountCents: purchase.totalPriceCents,
  });
  return { id: purchase.id, tenantId: purchase.tenantId, creditsBought: purchase.creditsBought };
}

// --- Shared small helpers ----------------------------------------------------

function advancePeriod(from: Date, cycle: "MONTHLY" | "YEARLY"): Date {
  const d = new Date(from);
  if (cycle === "YEARLY") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function mapProviderStatus(status?: string): TenantStatus | null {
  if (!status) return null;
  switch (status.toLowerCase()) {
    case "active":
    case "paid":
    case "confirmed":
    case "authorized":
      return "ACTIVE";
    case "past_due":
    case "overdue":
    case "unpaid":
    case "refused":
      return "PAST_DUE";
    case "canceled":
    case "cancelled":
      return "CANCELLED";
    case "trialing":
    case "incomplete":
      return "TRIAL";
    default:
      return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}