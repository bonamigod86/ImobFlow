import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedBillingEvent } from "@/lib/billing/types";

/**
 * Webhook ingestion — idempotency ledger contract.
 * The unique (provider, providerEventId) row means each canonical event applies
 * EXACTLY once: redeliveries are acknowledged without side effects; failed
 * attempts get a single retry that converges. The state-machine handlers are
 * mocked here — this file tests the ledger/dispatch wiring only.
 */

const mocks = vi.hoisted(() => {
  const prismaUnscoped = {
    billingEvent: { create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() },
  };
  const handlers = {
    handleInvoicePaid: vi.fn(),
    handleInvoicePaymentFailed: vi.fn(),
    handleSubscriptionUpdated: vi.fn(),
    handleSubscriptionDeleted: vi.fn(),
    handleCheckoutCompleted: vi.fn(),
  };
  return { prismaUnscoped, handlers };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.prismaUnscoped,
  prismaUnscoped: mocks.prismaUnscoped,
}));

vi.mock("@/lib/billing/state-machine", () => mocks.handlers);

import { ingestNormalizedEvent } from "@/lib/billing/billing-events";

const EVT: NormalizedBillingEvent = {
  providerEventId: "evt_1",
  type: "invoice.paid",
  tenantId: "t-acme",
  raw: { id: "evt_1", type: "invoice.paid" },
};

const OUTCOME = {
  eventId: "evt_1",
  type: "invoice.paid",
  processed: true,
  tenantId: "t-acme",
  action: "invoice_paid",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingestNormalizedEvent", () => {
  it("applies a fresh event and marks the ledger PROCESSED", async () => {
    mocks.prismaUnscoped.billingEvent.create.mockResolvedValue({ id: "ledger_1", status: "RECEIVED", tenantId: null });
    mocks.handlers.handleInvoicePaid.mockResolvedValue(OUTCOME);

    const result = await ingestNormalizedEvent("CUSTOM", EVT, JSON.stringify(EVT.raw));

    expect(result).toMatchObject({ processed: true, action: "invoice_paid" });
    expect(mocks.handlers.handleInvoicePaid).toHaveBeenCalledTimes(1);
    expect(mocks.prismaUnscoped.billingEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ledger_1" },
        data: expect.objectContaining({ status: "PROCESSED", tenantId: "t-acme" }),
      }),
    );
  });

  it("acknowledges a duplicate delivery without applying side effects", async () => {
    mocks.prismaUnscoped.billingEvent.create.mockImplementation(() => {
      const err = new Error("unique violation") as Error & { code?: string };
      err.code = "P2002";
      throw err;
    });
    mocks.prismaUnscoped.billingEvent.findUniqueOrThrow.mockResolvedValue({
      id: "ledger_1",
      status: "PROCESSED",
      tenantId: "t-acme",
    });

    const result = await ingestNormalizedEvent("CUSTOM", EVT, "{}");

    expect(result).toMatchObject({ processed: true, action: "duplicate_ignored" });
    expect(mocks.handlers.handleInvoicePaid).not.toHaveBeenCalled();
    expect(mocks.prismaUnscoped.billingEvent.update).not.toHaveBeenCalled();
  });

  it("re-runs a previously FAILED attempt idempotently", async () => {
    mocks.prismaUnscoped.billingEvent.create.mockResolvedValue({
      id: "ledger_1",
      status: "FAILED",
      tenantId: null,
    });
    mocks.handlers.handleInvoicePaid.mockResolvedValue(OUTCOME);

    const result = await ingestNormalizedEvent("CUSTOM", EVT, JSON.stringify(EVT.raw));

    expect(result).toMatchObject({ action: "invoice_paid" });
    expect(mocks.prismaUnscoped.billingEvent.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "ledger_1" },
        data: expect.objectContaining({ status: "RECEIVED", error: null }),
      }),
    );
    expect(mocks.prismaUnscoped.billingEvent.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "ledger_1" },
        data: expect.objectContaining({ status: "PROCESSED" }),
      }),
    );
  });

  it("records the failure on the ledger row when dispatch throws", async () => {
    mocks.prismaUnscoped.billingEvent.create.mockResolvedValue({
      id: "ledger_1",
      status: "RECEIVED",
      tenantId: null,
    });
    mocks.handlers.handleInvoicePaid.mockRejectedValue(new Error("boom"));

    await expect(ingestNormalizedEvent("CUSTOM", EVT, "{}")).rejects.toThrow("boom");

    expect(mocks.prismaUnscoped.billingEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ledger_1" },
        data: expect.objectContaining({
          status: "FAILED",
          error: "boom",
        }),
      }),
    );
    expect(mocks.handlers.handleInvoicePaid).toHaveBeenCalledTimes(1);
  });
});