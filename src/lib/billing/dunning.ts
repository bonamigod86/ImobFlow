import type { BillingNotificationKind, Prisma, TenantStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { TenantCache } from "@/lib/cache/tenant-cache";
import { eventBus } from "@/lib/events/event-bus";
import { env } from "@/lib/config/env";
import "../events/register";

/**
 * Automated dunning engine (global, runs on the billing worker).
 *
 * Sweeps the payment lifecycle end-to-end:
 *   1. PRE_DUE       — TRIAL/ACTIVE subscriptions whose period renews within
 *                      `BILLING_PRE_DUE_NOTIFY_DAYS` get a reminder.
 *   2. DUE_REMINDER  — communication on the due day itself (ACTIVE/PENDING_DUE).
 *   3. Trial end     — TRIAL past its window becomes PENDING_DUE ("Pendente")
 *                      with its first OPEN invoice; free plans go straight to
 *                      ACTIVE (nothing to collect).
 *   4. Overdue       — PENDING_DUE/ACTIVE with an OPEN invoice whose due date
 *                      elapsed are promoted to PAST_DUE ("Vencida").
 *   5. LATE_REMINDER — while PAST_DUE, re-notify every
 *                      `BILLING_DUNNING_LATE_EVERY_DAYS` days.
 *   6. Grace         — PAST_DUE past `graceEndsAt` auto-suspends (BLOCKED),
 *                      reversible, masked by `BILLING_AUTOSUSPEND_ENABLED` and
 *                      never applied to an ops lockout.
 *
 * Every mutation is idempotent and re-runnable: notifications are unique per
 * (tenant, kind, dueDate) and status transitions are guarded by current state.
 * Notification inserts take the `billingNotification` delegate explicitly so
 * the same code path runs inside a $transaction (state machine) or against
 * prismaUnscoped (this scan) without type gymnastics.
 */

export interface GlobalScanResult {
  preDueNotified: number;
  dueReminded: number;
  trialExpired: number;
  /** PENDING_DUE/ACTIVE subscriptions whose OPEN invoice outlived its due date. */
  payableExpired: number;
  lateReminded: number;
  suspended: number;
  skippedSuspended: number;
}

type BillingNotificationDelegate = typeof prismaUnscoped.billingNotification;

const DAY_MS = 24 * 60 * 60 * 1000;

function graceDays(plan: { gracePeriodDays: number } | null): number {
  const planDays = plan?.gracePeriodDays ?? 0;
  return planDays > 0 ? planDays : env.BILLING_GRACE_DAYS;
}

async function recordNotification(
  delegate: BillingNotificationDelegate,
  input: {
    tenantId: string;
    subscriptionId: string | null;
    kind: BillingNotificationKind;
    dueDate: Date;
    payload?: unknown;
  },
): Promise<void> {
  const { tenantId, subscriptionId, kind, dueDate, payload } = input;
  await delegate.upsert({
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

interface OverdueInvoice {
  id: string;
  dueDate: Date;
  status: string;
}

interface ScanCandidate {
  id: string;
  tenantId: string;
  planId: string;
  status: TenantStatus;
  priceCents: number;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  nextInvoiceDueAt: Date | null;
  plan: { gracePeriodDays: number; priceCents: number } | null;
  tenant: {
    id: string;
    status: TenantStatus;
    manualBlockedAt: Date | null;
    slug: string;
  };
}

/** Append-or-keep helper for the earliest OPEN/OVERDUE invoice per subscription. */
function earliestOpen(
  map: Map<string, OverdueInvoice[]>,
  inv: { subscriptionId: string | null; id: string; dueDate: Date; status: string },
): void {
  if (!inv.subscriptionId) return;
  const list = map.get(inv.subscriptionId) ?? [];
  list.push({ id: inv.id, dueDate: inv.dueDate, status: inv.status });
  map.set(inv.subscriptionId, list);
}

/**
 * Apply the automatic suspension for one expired-grace subscription. Returns
 * true when the tenant was actually blocked, false when skipped (ops lockout
 * or master switch off). Suspension preserves tenant data.
 *
 * Runs as plain sequential updates (not an interactive $transaction): this is a
 * global sweep against a remote Postgres where interactive-transaction
 * round-trips blow the 5s Prisma budget under load. Worst-case partial failure
 * leaves the subscription BLOCKED and the tenant ACTIVE — the next scan
 * converges (guarded, idempotent).
 */
async function suspendTenant(candidate: ScanCandidate): Promise<boolean> {
  if (candidate.tenant.manualBlockedAt) return false;
  if (!env.BILLING_AUTOSUSPEND_ENABLED) return false;

  const now = new Date();
  await prismaUnscoped.tenantSubscription.update({
    where: { id: candidate.id },
    data: { status: "BLOCKED", blockedAt: now },
  });
  const updated = await prismaUnscoped.tenant.update({
    where: { id: candidate.tenant.id },
    data: { status: "BLOCKED" },
  });
  await TenantCache.invalidate(updated.id, updated.slug);
  eventBus.emit("tenant.status_changed", {
    tenantId: updated.id,
    actorUserId: null,
    from: candidate.tenant.status,
    to: "BLOCKED",
    reason: "billing:grace_expired",
  });
  eventBus.emit("billing.subscription.blocked", {
    tenantId: candidate.tenant.id,
    subscriptionId: candidate.id,
    reason: "grace_period_expired",
    blockedAt: now.toISOString(),
  });
  await recordNotification(prismaUnscoped.billingNotification, {
    tenantId: candidate.tenant.id,
    subscriptionId: candidate.id,
    kind: "GRACE_EXPIRED",
    dueDate: now,
    payload: { blockedAt: now.toISOString() },
  });
  return true;
}

/** Mirror `state-machine.syncTenantStatus` for the scan's promote step. */
async function promoteToPastDue(candidate: ScanCandidate, invoice: OverdueInvoice): Promise<void> {
  const graceEndsAt = new Date(invoice.dueDate.getTime() + graceDays(candidate.plan) * DAY_MS);
  await prismaUnscoped.tenantSubscription.update({
    where: { id: candidate.id },
    data: { status: "PAST_DUE", graceEndsAt, nextInvoiceDueAt: invoice.dueDate },
  });
  await prismaUnscoped.paymentInvoice.update({
    where: { id: invoice.id },
    data: { status: "OVERDUE" },
  });

  const effective: TenantStatus = candidate.tenant.manualBlockedAt ? "BLOCKED" : "PAST_DUE";
  if (candidate.tenant.status !== effective) {
    const updated = await prismaUnscoped.tenant.update({
      where: { id: candidate.tenant.id },
      data: { status: effective },
    });
    await TenantCache.invalidate(updated.id, updated.slug);
    eventBus.emit("tenant.status_changed", {
      tenantId: updated.id,
      actorUserId: null,
      from: candidate.tenant.status,
      to: effective,
      reason: "billing:invoice_overdue",
    });
  }

  await recordNotification(prismaUnscoped.billingNotification, {
    tenantId: candidate.tenant.id,
    subscriptionId: candidate.id,
    kind: "PAYMENT_FAILED",
    dueDate: invoice.dueDate,
    payload: {
      amountCents: candidate.priceCents,
      overdue: true,
      graceEndsAt: graceEndsAt.toISOString(),
    },
  });
  eventBus.emit("billing.subscription.past_due", {
    tenantId: candidate.tenant.id,
    subscriptionId: candidate.id,
    amountCents: candidate.priceCents,
    graceEndsAt: graceEndsAt.toISOString(),
  });
}

export async function runGlobalBillingScan(now: Date = new Date()): Promise<GlobalScanResult> {
  const result: GlobalScanResult = {
    preDueNotified: 0,
    dueReminded: 0,
    trialExpired: 0,
    payableExpired: 0,
    lateReminded: 0,
    suspended: 0,
    skippedSuspended: 0,
  };

  // Earliest OPEN/OVERDUE invoice per subscription (overdue + late cadence).
  const openInvoices = await prismaUnscoped.paymentInvoice.findMany({
    where: { status: { in: ["OPEN", "OVERDUE"] } },
    select: { subscriptionId: true, id: true, dueDate: true, status: true },
    orderBy: { dueDate: "asc" },
  });
  const invoicesBySub = new Map<string, OverdueInvoice[]>();
  for (const inv of openInvoices) earliestOpen(invoicesBySub, inv);

  // 1 — Pre-due reminders for renewing ACTIVE/TRIAL subscriptions.
  const windowEnd = new Date(now.getTime() + env.BILLING_PRE_DUE_NOTIFY_DAYS * DAY_MS);
  const dueSoon = await prismaUnscoped.tenantSubscription.findMany({
    where: {
      OR: [{ status: "ACTIVE" }, { status: "TRIAL" }],
      nextInvoiceDueAt: { lte: windowEnd, gte: now },
    },
    include: { tenant: { select: { id: true } } },
  });
  for (const sub of dueSoon) {
    const dueDate = sub.nextInvoiceDueAt!;
    await recordNotification(prismaUnscoped.billingNotification, {
      tenantId: sub.tenant.id,
      subscriptionId: sub.id,
      kind: "PRE_DUE",
      dueDate,
      payload: { amountCents: sub.priceCents, dueAt: dueDate.toISOString() },
    });
    result.preDueNotified += 1;
  }

  // 1.5 — Communication on the due day itself (Pendente / active renewal).
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  const dueToday = await prismaUnscoped.tenantSubscription.findMany({
    where: {
      OR: [{ status: "ACTIVE" }, { status: "PENDING_DUE" }],
      nextInvoiceDueAt: { gte: dayStart, lt: dayEnd },
    },
    include: { tenant: { select: { id: true } } },
  });
  for (const sub of dueToday) {
    const dueDate = sub.nextInvoiceDueAt!;
    await recordNotification(prismaUnscoped.billingNotification, {
      tenantId: sub.tenant.id,
      subscriptionId: sub.id,
      kind: "DUE_REMINDER",
      dueDate,
      payload: { amountCents: sub.priceCents, dueAt: dueDate.toISOString() },
    });
    result.dueReminded += 1;
  }

  // 2 — Walk every TRIAL / PENDING_DUE / ACTIVE (overdue invoices) / PAST_DUE row.
  const candidates = await prismaUnscoped.tenantSubscription.findMany({
    where: { status: { in: ["TRIAL", "PENDING_DUE", "ACTIVE", "PAST_DUE"] } },
    include: {
      plan: { select: { gracePeriodDays: true, priceCents: true } },
      tenant: { select: { id: true, status: true, manualBlockedAt: true, slug: true } },
    },
  });

  for (const candidate of candidates as ScanCandidate[]) {
    if (candidate.status === "TRIAL") {
      const trialEndsAt = candidate.trialEndsAt;
      if (trialEndsAt && trialEndsAt <= now) {
        if (candidate.plan && candidate.plan.priceCents > 0) {
          // First invoice pending → "Pendente" (waiting the payment window).
          await prismaUnscoped.tenantSubscription.update({
            where: { id: candidate.id },
            data: { status: "PENDING_DUE", nextInvoiceDueAt: trialEndsAt },
          });
          await prismaUnscoped.paymentInvoice.upsert({
            where: { providerInvoiceId: `trial:${candidate.id}:${trialEndsAt.getTime()}` },
            update: {},
            create: {
              tenantId: candidate.tenantId,
              subscriptionId: candidate.id,
              providerInvoiceId: `trial:${candidate.id}:${trialEndsAt.getTime()}`,
              amountCents: candidate.plan.priceCents,
              status: "OPEN",
              dueDate: trialEndsAt,
            },
          });
        } else {
          // Free plan — nothing to collect, roll straight into active.
          await prismaUnscoped.tenantSubscription.update({
            where: { id: candidate.id },
            data: { status: "ACTIVE", trialEndsAt, nextInvoiceDueAt: null },
          });
        }
        result.trialExpired += 1;
      }
      continue;
    }

    if (candidate.status === "PENDING_DUE" || candidate.status === "ACTIVE") {
      const open = invoicesBySub.get(candidate.id)?.find((i) => i.dueDate < now);
      if (open) {
        await promoteToPastDue(candidate, open);
        result.payableExpired += 1;
      }
      continue;
    }

    // PAST_DUE.
    const overdue = invoicesBySub.get(candidate.id);
    const anchor = overdue?.[0]?.dueDate;
    if (anchor && anchor < now) {
      const cadence = env.BILLING_DUNNING_LATE_EVERY_DAYS * DAY_MS;
      const periods = Math.floor((now.getTime() - anchor.getTime()) / cadence);
      if (periods >= 1) {
        await recordNotification(prismaUnscoped.billingNotification, {
          tenantId: candidate.tenantId,
          subscriptionId: candidate.id,
          kind: "LATE_REMINDER",
          dueDate: new Date(anchor.getTime() + periods * cadence),
          payload: { amountCents: candidate.priceCents, periodsLate: periods },
        });
        result.lateReminded += 1;
      }
    }

    const graceEndsAt = candidate.graceEndsAt
      ? candidate.graceEndsAt
      : new Date(now.getTime() + graceDays(candidate.plan) * DAY_MS);
    if (graceEndsAt <= now) {
      const suspended = await suspendTenant(candidate);
      if (suspended) result.suspended += 1;
      else result.skippedSuspended += 1;
    }
  }

  return result;
}

/** Convenience alias — used by the billing worker and the MASTER "run now" action. */
export const runBillingScan = runGlobalBillingScan;