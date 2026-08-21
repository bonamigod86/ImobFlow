import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Platform insights contract (Checklist Item 16): clients by type/status,
 * properties, leads (real-estate vs financial, forwarded, by city/agency,
 * conversion) aggregation mapping.
 */

const mocks = vi.hoisted(() => {
  const prismaUnscoped = {
    tenant: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    property: { groupBy: vi.fn(), count: vi.fn() },
    propertyHighlight: { count: vi.fn() },
    lead: { count: vi.fn(), findMany: vi.fn() },
    webhookDelivery: { count: vi.fn() },
  };
  return { prismaUnscoped };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.prismaUnscoped,
  prismaUnscoped: mocks.prismaUnscoped,
}));

import { getPlatformInsights } from "@/lib/admin/insights";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPlatformInsights", () => {
  it("aggregates clients, properties, leads and conversion", async () => {
    mocks.prismaUnscoped.tenant.groupBy
      .mockResolvedValueOnce([
        { type: "AGENCY", _count: 2 },
        { type: "BROKER", _count: 1 },
      ])
      .mockResolvedValueOnce([
        { status: "ACTIVE", _count: 2 },
        { status: "TRIAL", _count: 1 },
      ]);
    mocks.prismaUnscoped.tenant.count.mockResolvedValue(1); // newClients
    mocks.prismaUnscoped.property.groupBy.mockResolvedValue([
      { status: "ACTIVE", _count: 3 },
      { status: "SOLD", _count: 1 },
    ]);
    mocks.prismaUnscoped.property.count.mockResolvedValue(1);
    mocks.prismaUnscoped.propertyHighlight.count.mockResolvedValue(2);
    mocks.prismaUnscoped.lead.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2); // total, qualified
    mocks.prismaUnscoped.lead.findMany
      .mockResolvedValueOnce([
        { type: "BUYER", tenantId: "t-a", payload: { city: "SP" }, financeProfile: { city: null } },
        { type: "FINANCIAL", tenantId: "t-b", payload: null, financeProfile: { city: "RJ" } },
        { type: "RENTER", tenantId: "t-a", payload: { cidade: "BH" }, financeProfile: null },
      ])
      .mockResolvedValueOnce([
        { type: "BUYER", tenantId: "t-a", payload: { city: "SP" }, financeProfile: { city: null } },
        { type: "FINANCIAL", tenantId: "t-b", payload: null, financeProfile: { city: "RJ" } },
        { type: "RENTER", tenantId: "t-a", payload: { cidade: "BH" }, financeProfile: null },
      ]);
    mocks.prismaUnscoped.webhookDelivery.count.mockResolvedValue(3);
    mocks.prismaUnscoped.tenant.findMany.mockResolvedValue([
      { id: "t-a", name: "ACME", slug: "acme" },
      { id: "t-b", name: "Norton", slug: "norton" },
    ]);

    const insights = await getPlatformInsights();

    expect(insights.clients).toEqual(
      expect.objectContaining({ total: 3, agencies: 2, brokers: 1, paid: 2, trial: 1, newThisPeriod: 1 }),
    );
    expect(insights.properties).toEqual(
      expect.objectContaining({ total: 4, active: 3, sold: 1, newThisPeriod: 1, highlighted: 2 }),
    );
    expect(insights.leads).toEqual(
      expect.objectContaining({
        total: 5,
        inPeriod: 3,
        realEstate: 2,
        financial: 1,
        forwarded: 3,
        qualified: 2,
      }),
    );
    expect(insights.leads.conversion.qualifiedRate).toBeCloseTo(2 / 3);
    expect(insights.leads.byCity).toEqual(
      expect.arrayContaining([
        { city: "SP", count: 1 },
        { city: "RJ", count: 1 },
        { city: "BH", count: 1 },
      ]),
    );
    expect(insights.leads.byAgency).toEqual(
      expect.arrayContaining([
        { tenantId: "t-a", tenantName: "ACME", tenantSlug: "acme", count: 2 },
        { tenantId: "t-b", tenantName: "Norton", tenantSlug: "norton", count: 1 },
      ]),
    );
  });
});
