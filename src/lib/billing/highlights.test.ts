import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";

/**
 * Highlight add-on ledger — the append-only credit system behind the
 * monetization feature: entitlement grants, purchase top-ups, activation
 * debits and the strict balance invariants (debits can never overdraw).
 */

const mocks = vi.hoisted(() => {
  const prismaUnscoped = {
    highlightCreditLedger: { findFirst: vi.fn(), create: vi.fn() },
    highlightPurchase: { create: vi.fn(), findUnique: vi.fn() },
    property: { findFirst: vi.fn(), update: vi.fn() },
    propertyHighlight: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn({
      highlightCreditLedger: prismaUnscoped.highlightCreditLedger,
      property: prismaUnscoped.property,
      propertyHighlight: prismaUnscoped.propertyHighlight,
    })),
  };
  const eventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
  return { prismaUnscoped, eventBus };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.prismaUnscoped,
  prismaUnscoped: mocks.prismaUnscoped,
}));

vi.mock("@/lib/events/event-bus", () => ({ eventBus: mocks.eventBus }));

import {
  activateHighlight,
  creditHighlights,
  grantPlanAllotment,
} from "@/lib/billing/highlights";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prismaUnscoped.highlightCreditLedger.findFirst.mockResolvedValue(null);
  mocks.prismaUnscoped.highlightCreditLedger.create.mockImplementation(
    ({ data }: { data: { balanceAfter: number } }) => Promise.resolve({ id: "ledger", ...data }),
  );
});

describe("creditHighlights", () => {
  it("starts a ledger at zero and tracks running balances", async () => {
    mocks.prismaUnscoped.highlightCreditLedger.findFirst.mockResolvedValueOnce(null);
    const first = await creditHighlights(mocks.prismaUnscoped as never, "t-acme", {
      kind: "PLAN_ALLOTMENT",
      amount: 30,
    });
    expect(first.balance).toBe(30);
    expect(mocks.prismaUnscoped.highlightCreditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ balanceBefore: 0, balanceAfter: 30, amount: 30, tenantId: "t-acme" }),
      }),
    );
  });

  it("debits against the existing balance", async () => {
    mocks.prismaUnscoped.highlightCreditLedger.findFirst.mockResolvedValue({ balanceAfter: 30 });
    mocks.prismaUnscoped.highlightCreditLedger.create.mockResolvedValue({ id: "l2" });

    const result = await creditHighlights(mocks.prismaUnscoped as never, "t-acme", {
      kind: "ACTIVATION_DEBIT",
      amount: -10,
    });

    expect(result.balance).toBe(20);
    expect(mocks.prismaUnscoped.highlightCreditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ balanceBefore: 30, balanceAfter: 20, amount: -10 }),
      }),
    );
  });

  it("skips the grant when a plan carries no credits", async () => {
    mocks.prismaUnscoped.highlightCreditLedger.findFirst.mockResolvedValue({ balanceAfter: 5 });
    const balance = await grantPlanAllotment(mocks.prismaUnscoped as never, "t-free", "plan_free", 0);
    expect(balance).toBe(5);
    expect(mocks.prismaUnscoped.highlightCreditLedger.create).not.toHaveBeenCalled();
  });
});

describe("activateHighlight", () => {
  it("blocks the activation when credits are insufficient", async () => {
    mocks.prismaUnscoped.highlightCreditLedger.findFirst.mockResolvedValue({ balanceAfter: 2 });

    await expect(
      activateHighlight({ tenantId: "t-acme", propertyId: "p1", days: 10 }),
    ).rejects.toBeInstanceOf(AppError);
    expect(mocks.prismaUnscoped.property.findFirst).not.toHaveBeenCalled();
  });

  it("consumes credits, upserts the window and flags the property", async () => {
    mocks.prismaUnscoped.highlightCreditLedger.findFirst.mockResolvedValue({ balanceAfter: 30 });
    mocks.prismaUnscoped.highlightCreditLedger.create.mockResolvedValue({ id: "l2" });
    mocks.prismaUnscoped.property.findFirst.mockResolvedValue({ id: "p1", tenantId: "t-acme", code: "ACA-001" });
    mocks.prismaUnscoped.propertyHighlight.findFirst.mockResolvedValue(null);
    mocks.prismaUnscoped.propertyHighlight.create.mockResolvedValue({
      id: "h1",
      tenantId: "t-acme",
      propertyId: "p1",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 10 * 86400000),
      source: "PLAN",
      priorityBoost: 2,
    });
    mocks.prismaUnscoped.property.update.mockResolvedValue({ id: "p1" });

    const result = await activateHighlight({
      tenantId: "t-acme",
      propertyId: "p1",
      days: 10,
      priorityBoost: 2,
      source: "PLAN",
    });

    expect(result.creditBalance).toBe(20);
    expect(mocks.prismaUnscoped.highlightCreditLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: -10, balanceBefore: 30, balanceAfter: 20, kind: "ACTIVATION_DEBIT" }),
      }),
    );
    expect(mocks.prismaUnscoped.propertyHighlight.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t-acme",
          propertyId: "p1",
          source: "PLAN",
          priorityBoost: 2,
        }),
      }),
    );
    expect(mocks.prismaUnscoped.property.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { isFeatured: true },
    });
    expect(mocks.eventBus.emit).toHaveBeenCalledWith("billing.highlight.activated", expect.objectContaining({ propertyId: "p1" }));
  });
});