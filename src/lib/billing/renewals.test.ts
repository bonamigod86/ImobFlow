import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Recurring-charge contract (checklist item 13): the renewal scan mints the
 * next-period invoice exactly once, and auto-collect settles a local invoice
 * through the canonical (idempotent) payment pipeline.
 */

const mocks = vi.hoisted(() => {
  const prismaUnscoped = {
    tenantSubscription: { findMany: vi.fn(), findUnique: vi.fn() },
    paymentInvoice: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    billingEvent: { create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
  };
  const eventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
  const ingestNormalizedEvent = vi.fn(async () => ({
    eventId: "auto-collect:local-inv",
    type: "invoice.paid",
    processed: true,
    tenantId: "t-acme",
    action: "invoice_paid",
  }));
  return { prismaUnscoped, eventBus, ingestNormalizedEvent };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.prismaUnscoped,
  prismaUnscoped: mocks.prismaUnscoped,
}));

vi.mock("@/lib/events/event-bus", () => ({ eventBus: mocks.eventBus }));

vi.mock("@/lib/billing/billing-events", () => ({
  ingestNormalizedEvent: mocks.ingestNormalizedEvent,
}));

import { runGlobalRenewalScan, settleInvoiceAutomatically } from "@/lib/billing/renewals";

const now = Date.now();
const DAY = 24 * 60 * 60 * 1000;

const DUE_SUB = {
  id: "sub_renewal",
  tenantId: "t-acme",
  status: "ACTIVE",
  priceCents: 49900,
  nextInvoiceDueAt: new Date(now - 1 * DAY),
  plan: { priceCents: 49900 },
};

const FREE_SUB = {
  ...DUE_SUB,
  id: "sub_free",
  tenantId: "t-free",
  priceCents: 0,
  plan: { priceCents: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runGlobalRenewalScan", () => {
  it("mints the next-period OPEN invoice for ACTIVE subscriptions past their due date", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany.mockResolvedValue([DUE_SUB]);
    mocks.prismaUnscoped.paymentInvoice.findFirst.mockResolvedValue(null);
    mocks.prismaUnscoped.paymentInvoice.create.mockResolvedValue({ id: "inv_next" });

    const result = await runGlobalRenewalScan(new Date(now));

    expect(result.opened).toBe(1);
    expect(result.alreadyOpen).toBe(0);
    expect(result.skippedFree).toBe(0);
    expect(mocks.prismaUnscoped.paymentInvoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t-acme",
        subscriptionId: "sub_renewal",
        providerInvoiceId: `local:sub_renewal:${DUE_SUB.nextInvoiceDueAt.getTime()}`,
        amountCents: 49900,
        status: "OPEN",
        dueDate: DUE_SUB.nextInvoiceDueAt,
      }),
    });
  });

  it("does not mint twice when an OPEN/OVERDUE invoice already exists", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany.mockResolvedValue([DUE_SUB]);
    mocks.prismaUnscoped.paymentInvoice.findFirst.mockResolvedValue({ id: "inv_open" });

    const result = await runGlobalRenewalScan(new Date(now));

    expect(result.opened).toBe(0);
    expect(result.alreadyOpen).toBe(1);
    expect(mocks.prismaUnscoped.paymentInvoice.create).not.toHaveBeenCalled();
  });

  it("never invoices free plans", async () => {
    mocks.prismaUnscoped.tenantSubscription.findMany.mockResolvedValue([FREE_SUB]);

    const result = await runGlobalRenewalScan(new Date(now));

    expect(result.skippedFree).toBe(1);
    expect(mocks.prismaUnscoped.paymentInvoice.findFirst).not.toHaveBeenCalled();
    expect(mocks.prismaUnscoped.paymentInvoice.create).not.toHaveBeenCalled();
  });
});

describe("settleInvoiceAutomatically", () => {
  it("routes an OPEN invoice payment through the canonical pipeline", async () => {
    const invoice = {
      id: "local-inv",
      tenantId: "t-acme",
      amountCents: 49900,
      dueDate: new Date(now - 1 * DAY),
      providerInvoiceId: "inv-1",
      status: "OPEN" as const,
      subscriptionId: "sub_renewal",
    };
    mocks.prismaUnscoped.paymentInvoice.findUnique.mockResolvedValue(invoice);
    mocks.prismaUnscoped.tenantSubscription.findUnique.mockResolvedValue({
      id: "sub_renewal",
      providerSubscriptionId: "sub_x",
    });

    const { outcome } = await settleInvoiceAutomatically("local-inv");

    expect(mocks.ingestNormalizedEvent).toHaveBeenCalledWith(
      "CUSTOM",
      expect.objectContaining({
        providerEventId: "auto-collect:local-inv",
        type: "invoice.paid",
        tenantId: "t-acme",
        amountCents: 49900,
        providerInvoiceId: "inv-1",
      }),
      expect.any(String),
    );
    expect(outcome.processed).toBe(true);
    expect(mocks.eventBus.emit).toHaveBeenCalledWith(
      "billing.invoice.autocollected",
      expect.objectContaining({ invoiceId: "local-inv" }),
    );
  });

  it("keeps the ledger idempotency for already-paid invoices (no double settle)", async () => {
    const invoice = {
      id: "local-inv-paid",
      tenantId: "t-acme",
      amountCents: 49900,
      dueDate: new Date(now - 5 * DAY),
      providerInvoiceId: "inv-1",
      status: "PAID" as const,
      subscriptionId: null,
    };
    mocks.prismaUnscoped.paymentInvoice.findUnique.mockResolvedValue(invoice);

    await settleInvoiceAutomatically("local-inv-paid");

    // Same providerEventId as the original payment → the ledger dedupes it.
    expect(mocks.ingestNormalizedEvent).toHaveBeenCalledWith(
      "CUSTOM",
      expect.objectContaining({ providerEventId: "auto-collect:local-inv-paid" }),
      expect.any(String),
    );
  });
});