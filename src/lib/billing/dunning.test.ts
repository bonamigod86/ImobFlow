import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dunning scan contract — pre-due + due-day reminders, trial-end -> PENDING_DUE,
 * overdue promotion (Pendente/Vencida), LATE_REMINDER cadence and grace-expiry
 * automatic suspension (honoring the ops lockout + master switch).
 */

const mocks = vi.hoisted(() => {
  const calls = { notify: [] as unknown[] };
  const prismaUnscoped = {
    tenantSubscription: { findMany: vi.fn(), update: vi.fn() },
    paymentInvoice: { findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    billingNotification: { upsert: vi.fn() },
    tenant: { update: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({
      tenantSubscription: prismaUnscoped.tenantSubscription,
      tenant: prismaUnscoped.tenant,
      billingNotification: prismaUnscoped.billingNotification,
    })),
  };
  const tenantCache = { invalidate: vi.fn() };
  const eventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
  return { prismaUnscoped, tenantCache, eventBus, calls };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.prismaUnscoped,
  prismaUnscoped: mocks.prismaUnscoped,
}));

vi.mock("@/lib/cache/tenant-cache", () => ({ TenantCache: mocks.tenantCache }));
vi.mock("@/lib/events/event-bus", () => ({ eventBus: mocks.eventBus }));

import { runGlobalBillingScan } from "@/lib/billing/dunning";

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

const ACTIVE_SUB = {
  id: "sub_active",
  tenantId: "t-acme",
  status: "ACTIVE",
  priceCents: 49900,
  nextInvoiceDueAt: new Date(now + 1 * DAY),
  trialEndsAt: null,
  graceEndsAt: null,
  tenant: { id: "t-acme" },
};

const DUE_TODAY_SUB = {
  id: "sub_due_today",
  tenantId: "t-acme",
  status: "ACTIVE",
  priceCents: 49900,
  nextInvoiceDueAt: new Date(now),
  trialEndsAt: null,
  graceEndsAt: null,
  tenant: { id: "t-acme" },
};

const TRIAL_PAID_SUB = {
  id: "sub_trial_paid",
  tenantId: "t-norton",
  status: "TRIAL",
  priceCents: 99900,
  nextInvoiceDueAt: new Date(now - 1 * DAY),
  trialEndsAt: new Date(now - 1 * DAY),
  graceEndsAt: null,
  plan: { gracePeriodDays: 5, priceCents: 99900 },
  tenant: { id: "t-norton" },
};

const TRIAL_FREE_SUB = {
  ...TRIAL_PAID_SUB,
  id: "sub_trial_free",
  tenantId: "t-free",
  priceCents: 0,
  plan: { gracePeriodDays: 5, priceCents: 0 },
  tenant: { id: "t-free" },
};

const PENDING_OVERDUE = {
  id: "sub_pending",
  tenantId: "t-delta",
  status: "PENDING_DUE",
  priceCents: 99900,
  nextInvoiceDueAt: new Date(now - 2 * DAY),
  trialEndsAt: null,
  graceEndsAt: null,
  plan: { gracePeriodDays: 5, priceCents: 99900 },
  tenant: { id: "t-delta", status: "PENDING_DUE", manualBlockedAt: null, slug: "delta" },
};

const ACTIVE_OVERDUE = {
  ...PENDING_OVERDUE,
  id: "sub_active_overdue",
  tenantId: "t-epsilon",
  status: "ACTIVE",
  tenant: { id: "t-epsilon", status: "ACTIVE", manualBlockedAt: null, slug: "epsilon" },
};

const PAST_DUE_EXPIRED = {
  id: "sub_due",
  tenantId: "t-delta",
  status: "PAST_DUE",
  priceCents: 99900,
  nextInvoiceDueAt: new Date(now - 5 * DAY),
  trialEndsAt: null,
  graceEndsAt: new Date(now - 2 * DAY),
  plan: { gracePeriodDays: 5, priceCents: 99900 },
  tenant: { id: "t-delta", status: "PAST_DUE", manualBlockedAt: null, slug: "delta" },
};

const PAST_DUE_LOCKED = {
  ...PAST_DUE_EXPIRED,
  id: "sub_locked",
  tenantId: "t-locked",
  priceCents: 0,
  tenant: { id: "t-locked", status: "PAST_DUE", manualBlockedAt: new Date(), slug: "locked" },
};

function openInvoice(subscriptionId: string, daysAgo: number) {
  return {
    id: `inv_${subscriptionId}`,
    subscriptionId,
    dueDate: new Date(now - daysAgo * DAY),
    status: "OPEN",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prismaUnscoped.billingNotification.upsert.mockResolvedValue({ id: "n" });
  mocks.prismaUnscoped.paymentInvoice.findMany.mockResolvedValue([]);
});

describe("runGlobalBillingScan", () => {
  it("sends PRE_DUE reminders for renewing subscriptions", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([ACTIVE_SUB])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await runGlobalBillingScan();

    expect(result.preDueNotified).toBe(1);
    expect(mocks.prismaUnscoped.billingNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_kind_dueDate: { tenantId: "t-acme", kind: "PRE_DUE", dueDate: expect.any(Date) },
        },
        create: expect.objectContaining({
          tenantId: "t-acme",
          subscriptionId: "sub_active",
          kind: "PRE_DUE",
        }),
      }),
    );
  });

  it("notifies on the due day itself (DUE_REMINDER)", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([DUE_TODAY_SUB])
      .mockResolvedValueOnce([]);

    const result = await runGlobalBillingScan();

    expect(result.dueReminded).toBe(1);
    expect(mocks.prismaUnscoped.billingNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tenantId: "t-acme", kind: "DUE_REMINDER" }),
      }),
    );
  });

  it("promotes an expired paid trial to PENDING_DUE with its first OPEN invoice", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TRIAL_PAID_SUB]);

    const result = await runGlobalBillingScan();

    expect(result.trialExpired).toBe(1);
    expect(mocks.prismaUnscoped.tenantSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_trial_paid" },
      data: { status: "PENDING_DUE", nextInvoiceDueAt: TRIAL_PAID_SUB.trialEndsAt },
    });
    expect(mocks.prismaUnscoped.paymentInvoice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: "t-norton",
          subscriptionId: "sub_trial_paid",
          status: "OPEN",
          amountCents: 99900,
        }),
      }),
    );
  });

  it("rolls a free plan straight into ACTIVE after its trial", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TRIAL_FREE_SUB]);

    const result = await runGlobalBillingScan();

    expect(result.trialExpired).toBe(1);
    expect(mocks.prismaUnscoped.tenantSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_trial_free" },
      data: { status: "ACTIVE", trialEndsAt: TRIAL_FREE_SUB.trialEndsAt, nextInvoiceDueAt: null },
    });
    expect(mocks.prismaUnscoped.paymentInvoice.upsert).not.toHaveBeenCalled();
  });

  it("promotes a PENDING_DUE subscription past its invoice due date to PAST_DUE", async () => {
    mocks.prismaUnscoped.paymentInvoice.findMany.mockResolvedValue([
      openInvoice("sub_pending", 2),
    ]);
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([PENDING_OVERDUE]);
    mocks.prismaUnscoped.tenant.update.mockResolvedValue({ id: "t-delta", slug: "delta" });

    const result = await runGlobalBillingScan();

    expect(result.payableExpired).toBe(1);
    expect(mocks.prismaUnscoped.tenantSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub_pending" },
        data: expect.objectContaining({ status: "PAST_DUE" }),
      }),
    );
    expect(mocks.prismaUnscoped.paymentInvoice.update).toHaveBeenCalledWith({
      where: { id: "inv_sub_pending" },
      data: { status: "OVERDUE" },
    });
    expect(mocks.tenantCache.invalidate).toHaveBeenCalledWith("t-delta", "delta");
  });

  it("promotes an ACTIVE renewal subscription with an overdue invoice to PAST_DUE", async () => {
    mocks.prismaUnscoped.paymentInvoice.findMany.mockResolvedValue([
      openInvoice("sub_active_overdue", 4),
    ]);
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([ACTIVE_OVERDUE]);
    mocks.prismaUnscoped.tenant.update.mockResolvedValue({ id: "t-epsilon", slug: "epsilon" });

    const result = await runGlobalBillingScan();

    expect(result.payableExpired).toBe(1);
    expect(mocks.prismaUnscoped.tenantSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub_active_overdue" },
        data: expect.objectContaining({ status: "PAST_DUE" }),
      }),
    );
  });

  it("emits LATE_REMINDERs on an overdue cadence for PAST_DUE subscriptions", async () => {
    mocks.prismaUnscoped.paymentInvoice.findMany.mockResolvedValue([
      openInvoice("sub_due", 7),
    ]);
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([PAST_DUE_EXPIRED]);

    const result = await runGlobalBillingScan();

    expect(result.lateReminded).toBe(1);
    expect(mocks.prismaUnscoped.billingNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tenantId: "t-delta", kind: "LATE_REMINDER" }),
      }),
    );
  });

  it("auto-suspends a PAST_DUE subscription past its grace window", async () => {
    mocks.prismaUnscoped.paymentInvoice.findMany.mockResolvedValue([
      openInvoice("sub_due", 7),
    ]);
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([PAST_DUE_EXPIRED]);
    mocks.prismaUnscoped.tenant.update.mockResolvedValue({ id: "t-delta", slug: "delta", status: "BLOCKED" });

    const result = await runGlobalBillingScan();

    expect(result.suspended).toBe(1);
    expect(mocks.eventBus.emit).toHaveBeenCalledWith(
      "billing.subscription.blocked",
      expect.objectContaining({ tenantId: "t-delta", subscriptionId: "sub_due" }),
    );
  });

  it("skips suspension for a manually blocked tenant (ops lockout)", async () => {
    mocks.prismaUnscoped.paymentInvoice.findMany.mockResolvedValue([
      openInvoice("sub_locked", 9),
    ]);
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([PAST_DUE_LOCKED]);

    const result = await runGlobalBillingScan();

    expect(result.suspended).toBe(0);
    expect(result.skippedSuspended).toBe(1);
    expect(mocks.prismaUnscoped.tenantSubscription.update).not.toHaveBeenCalled();
    expect(mocks.prismaUnscoped.tenant.update).not.toHaveBeenCalled();
  });
});