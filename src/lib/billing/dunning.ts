import type { Prisma, TenantStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { TenantCache } from "@/lib/cache/tenant-cache";
import { eventBus } from "@/lib/events/event-bus";
import { env } from "@/lib/config/env";
import "../events/register";

/**
 * Automated dunning engine (global, runs on the billing worker).
 *
 * Sweeps BOTH directions of the payment lifecycle:
 *   1. Pre-due:   TRIAL/ACTIVE subscriptions whose period renews within
 *                 `BILLING_PRE_DUE_NOTIFY_DAYS` get a reminder notification.
 *   2. Grace:     PAST_DUE subscriptions whose `graceEndsAt` expiry triggers an
 *                 automatic, reversible suspension (BLOCKED). Suspension flips
 *                 `Tenant.status` only — tenant data is NEVER deleted. The
 *                 master switch `BILLING_AUTOSUSPEND_ENABLED` can disable it.
 *   3. Trial end: TRIAL subscriptions past their trial window are pushed to
 *                 PAST_DUE (first invoice unpaid) so scanning converges.
 *
 * Every mutation is idempotent and re-runnable: notifications are unique per
 * (tenant, kind, dueDate) and status transitions are guarded by current state.
 * Notification inserts take the `billingNotification` delegate explicitly so
 * the same code path runs inside a $transaction (state machine) or against
 * prismaUnscoped (this scan) without type gymnastics.
 */

export interface GlobalScanResult {
  preDueNotified: number;
  trialExpired: number;
  suspended: number;
  skippedSuspended: number;
}

type NotificationKind = "PRE_DUE" | "PAYMENT_FAILED" | "GRACE_EXPIRED";

type BillingNotificationDelegate = typeof prismaUnscoped.billingNotification;

async function recordNotification(
  delegate: BillingNotificationDelegate,
  input: {
    tenantId: string;
    subscriptionId: string | null;
    kind: NotificationKind;
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

interface GraceCandidate {
  id: string;
  graceEndsAt: Date | null;
  tenant: {
    id: string;
    status: TenantStatus;
    manualBlockedAt: Date | null;
    slug: string;
  };
}

/**
 * Apply the automatic suspension for one expired-grace subscription. Returns
 * true when the tenant was actually blocked, false when skipped (ops lockout
 * or master switch off). Suspension preserves tenant data.
 */
async function suspendTenant(
  tx: Prisma.TransactionClient,
  candidate: GraceCandidate,
): Promise<boolean> {
  if (candidate.tenant.manualBlockedAt) return false;
  if (!env.BILLING_AUTOSUSPEND_ENABLED) return false;

  const now = new Date();
  await tx.tenantSubscription.update({
    where: { id: candidate.id },
    data: { status: "BLOCKED", blockedAt: now },
  });
  const updated = await tx.tenant.update({
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
  await recordNotification(tx.billingNotification, {
    tenantId: candidate.tenant.id,
    subscriptionId: candidate.id,
    kind: "GRACE_EXPIRED",
    dueDate: now,
    payload: { blockedAt: now.toISOString() },
  });
  return true;
}

export async function runGlobalBillingScan(): Promise<GlobalScanResult> {
  const now = new Date();
  const result: GlobalScanResult = {
    preDueNotified: 0,
    trialExpired: 0,
    suspended: 0,
    skippedSuspended: 0,
  };

  // 1 — Pre-due reminders for renewing ACTIVE/TRIAL subscriptions.
  const windowEnd = new Date(now.getTime() + env.BILLING_PRE_DUE_NOTIFY_DAYS * 24 * 60 * 60 * 1000);
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

  // 2 — Walk every TRIAL (first invoice never generated) and PAST_DUE row.
  const candidates = await prismaUnscoped.tenantSubscription.findMany({
    where: { status: { in: ["TRIAL", "PAST_DUE"] } },
    include: {
      tenant: { select: { id: true, status: true, manualBlockedAt: true, slug: true } },
    },
  });

  for (const subscription of candidates) {
    if (subscription.status === "TRIAL") {
      const trialEndsAt = subscription.trialEndsAt;
      if (trialEndsAt && trialEndsAt <= now) {
        await prismaUnscoped.tenantSubscription.update({
          where: { id: subscription.id },
          data: { status: "PAST_DUE", nextInvoiceDueAt: trialEndsAt },
        });
        result.trialExpired += 1;
      }
      continue;
    }

    // PAST_DUE — grace has elapsed (env default applies when the plan/state
    // machine never stamped an explicit date).
    const graceEndsAt = subscription.graceEndsAt
      ? subscription.graceEndsAt
      : new Date(now.getTime() + env.BILLING_GRACE_DAYS * 24 * 60 * 60 * 1000);
    if (graceEndsAt <= now) {
      const suspended = await prismaUnscoped.$transaction((tx) =>
        suspendTenant(tx, subscription),
      );
      if (suspended) result.suspended += 1;
      else result.skippedSuspended += 1;
    }
  }

  return result;
}

/** Convenience alias — used by the billing worker and the MASTER "run now" action. */
export const runBillingScan = runGlobalBillingScan;