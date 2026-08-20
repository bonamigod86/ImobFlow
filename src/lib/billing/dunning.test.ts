import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Dunning scan contract — pre-due notifications, trial-end promotion and
 * grace-expiry automatic suspension (honoring the ops lockout + master switch).
 */

const mocks = vi.hoisted(() => {
  const calls = { notify: [] as unknown[] };
  const prismaUnscoped = {
    tenantSubscription: { findMany: vi.fn(), update: vi.fn() },
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

const TRIAL_SUB = {
  id: "sub_trial",
  tenantId: "t-norton",
  status: "TRIAL",
  priceCents: 0,
  nextInvoiceDueAt: new Date(now + 10 * DAY),
  trialEndsAt: new Date(now - 1 * DAY),
  tenant: { id: "t-norton" },
};

const PAST_DUE_EXPIRED = {
  id: "sub_due",
  tenantId: "t-delta",
  status: "PAST_DUE",
  priceCents: 99900,
  nextInvoiceDueAt: new Date(now - 5 * DAY),
  trialEndsAt: null,
  graceEndsAt: new Date(now - 2 * DAY),
  tenant: { id: "t-delta", status: "PAST_DUE", manualBlockedAt: null, slug: "delta" },
};

const PAST_DUE_LOCKED = {
  ...PAST_DUE_EXPIRED,
  id: "sub_locked",
  tenantId: "t-locked",
  priceCents: 0,
  tenant: { id: "t-locked", status: "PAST_DUE", manualBlockedAt: new Date(), slug: "locked" },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prismaUnscoped.billingNotification.upsert.mockResolvedValue({ id: "n" });
});

describe("runGlobalBillingScan", () => {
  it("sends PRE_DUE reminders for renewing subscriptions", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([ACTIVE_SUB])
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

  it("promotes expired trials to PAST_DUE", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([TRIAL_SUB]);

    const result = await runGlobalBillingScan();

    expect(result.trialExpired).toBe(1);
    expect(mocks.prismaUnscoped.tenantSubscription.update).toHaveBeenCalledWith({
      where: { id: "sub_trial" },
      data: { status: "PAST_DUE", nextInvoiceDueAt: TRIAL_SUB.trialEndsAt },
    });
  });

  it("auto-suspends a PAST_DUE subscription past its grace window", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([PAST_DUE_EXPIRED]);
    mocks.prismaUnscoped.tenant.update.mockResolvedValue({ id: "t-delta", slug: "delta", status: "BLOCKED" });

    const result = await runGlobalBillingScan();

    expect(result.suspended).toBe(1);
    expect(mocks.prismaUnscoped.tenantSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub_due" },
        data: expect.objectContaining({ status: "BLOCKED" }),
      }),
    );
    expect(mocks.prismaUnscoped.tenant.update).toHaveBeenCalledWith({
      where: { id: "t-delta" },
      data: { status: "BLOCKED" },
    });
    expect(mocks.tenantCache.invalidate).toHaveBeenCalledWith("t-delta", "delta");
    expect(mocks.eventBus.emit).toHaveBeenCalledWith(
      "billing.subscription.blocked",
      expect.objectContaining({ tenantId: "t-delta", subscriptionId: "sub_due" }),
    );
    // Grace-expiry notification is recorded.
    expect(mocks.prismaUnscoped.billingNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ tenantId: "t-delta", kind: "GRACE_EXPIRED" }),
      }),
    );
  });

  it("skips suspension for a manually blocked tenant (ops lockout)", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([PAST_DUE_LOCKED]);

    const result = await runGlobalBillingScan();

    expect(result.suspended).toBe(0);
    expect(result.skippedSuspended).toBe(1);
    expect(mocks.prismaUnscoped.tenantSubscription.update).not.toHaveBeenCalled();
    expect(mocks.prismaUnscoped.tenant.update).not.toHaveBeenCalled();
  });
});