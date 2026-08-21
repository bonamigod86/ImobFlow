import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Subscription financial management contract (Checklist Item 17): invoice
 * history summaries, per-status totals, and CSV export formatting.
 */

const mocks = vi.hoisted(() => {
  const prismaUnscoped = {
    tenant: { findMany: vi.fn() },
    paymentInvoice: { groupBy: vi.fn() },
    plan: { findMany: vi.fn() },
  };
  return { prismaUnscoped };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.prismaUnscoped,
  prismaUnscoped: mocks.prismaUnscoped,
}));

import { getPayableSubscriptions, subscriptionsToCsv } from "@/lib/admin/finance";

const TENANT = {
  id: "t-1",
  name: "ACME",
  slug: "acme",
  type: "AGENCY",
  plan: { name: "Professional" },
  subscription: {
    status: "ACTIVE",
    priceCents: 49900,
    billingCycle: "MONTHLY",
    createdAt: new Date("2026-08-20T10:00:00Z"),
    lastPaymentAt: new Date("2026-08-20T10:00:00Z"),
    nextInvoiceDueAt: new Date("2026-09-20T10:00:00Z"),
    blockedAt: null,
    cancelledAt: null,
    plan: { name: "Professional" },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPayableSubscriptions", () => {
  it("maps tenant, plan and invoice-history summary into payable rows", async () => {
    mocks.prismaUnscoped.tenant.findMany.mockResolvedValue([TENANT]);
    mocks.prismaUnscoped.paymentInvoice.groupBy.mockResolvedValue([
      { tenantId: "t-1", status: "PAID", _count: { _all: 2 }, _sum: { amountCents: 99800 } },
      { tenantId: "t-1", status: "OVERDUE", _count: { _all: 1 }, _sum: { amountCents: 49900 } },
      { tenantId: "t-1", status: "OPEN", _count: { _all: 1 }, _sum: { amountCents: 49900 } },
    ]);

    const result = await getPayableSubscriptions({});
    const row = result.rows[0]!;

    expect(row.name).toBe("ACME");
    expect(row.planName).toBe("Professional");
    expect(row.priceCents).toBe(49900);
    expect(row.status).toBe("ACTIVE");
    expect(row.history).toMatchObject({ invoices: 4, paid: 2, overdue: 1, open: 1, paidCents: 99800, overdueCents: 49900, openCents: 49900 });
    expect(result.totals.paidCents).toBe(99800);
    expect(result.byStatus).toEqual([{ status: "ACTIVE", count: 1 }]);
  });

  it("applies a status filter to the subscription relation", async () => {
    mocks.prismaUnscoped.tenant.findMany.mockResolvedValue([]);
    mocks.prismaUnscoped.paymentInvoice.groupBy.mockResolvedValue([]);

    await getPayableSubscriptions({ status: "BLOCKED" });

    const where = mocks.prismaUnscoped.tenant.findMany.mock.calls[0]![0]!.where;
    expect(JSON.stringify(where)).toContain('"subscription"');
    expect(JSON.stringify(where)).toContain('"BLOCKED"');
  });
});

describe("subscriptionsToCsv", () => {
  it("emits a BOM CSV with header and escaped row values", () => {
    const csv = subscriptionsToCsv([
      {
        tenantId: "t-1",
        name: "ACME \"Top\"",
        slug: "acme",
        type: "AGENCY",
        planName: "Professional",
        priceCents: 49900,
        billingCycle: "MONTHLY",
        status: "ACTIVE",
        contractDate: "2026-08-20T10:00:00Z",
        lastPaymentAt: "2026-08-20T10:00:00Z",
        nextInvoiceDueAt: "2026-09-20T10:00:00Z",
        blockedAt: null,
        cancelledAt: null,
        history: { invoices: 3, paid: 2, overdue: 1, open: 0, paidCents: 99800, overdueCents: 0, openCents: 0 },
      },
    ]);

    expect(csv.startsWith("\uFEFFCliente;Slug;Tipo")).toBe(true);
    expect(csv).toContain('ACME ""Top""');
    expect(csv).toContain("499,00"); // R$ 499,00 — comma decimal formatting
    expect(csv).toContain("20/08/2026");
  });
});
