import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Public portal repository tests. Mock `prismaUnscoped` (the sanctioned
 * cross-tenant read path) to verify the visibility contract and filter wiring
 * without touching PostgreSQL.
 */

const mocks = vi.hoisted(() => {
  const DEC = class {
    constructor(public v: string) {}
    toFixed(n: number) {
      return Number(this.v).toFixed(n);
    }
  };
  const XY = class {
    constructor(public v: string) {}
    toString() {
      return this.v;
    }
  };
  const propertyRows = [
    {
      id: "p1",
      tenantId: "t-acme",
      tenant: { id: "t-acme", name: "ACME ImÃ³veis", slug: "acme" },
      code: "ACA-001",
      externalCode: null,
      title: "Apartamento Copacabana",
      description: "Vista parcial para o mar.",
      target: "SALE",
      category: "APARTMENT",
      status: "ACTIVE",
      salePrice: new DEC("750000.00"),
      rentPrice: null,
      condoFee: null,
      propertyTax: null,
      address: "Av. AtlÃ¢ntica 1000",
      number: "1000",
      city: "Rio de Janeiro",
      state: "RJ",
      neighborhood: "Copacabana",
      zipCode: "22010-010",
      latitude: new XY("-22.9711111"),
      longitude: new XY("-43.1822222"),
      area: new XY("68"),
      bedrooms: 2,
      suites: 1,
      bathrooms: 2,
      parkingSpots: 1,
      isFeatured: true,
      isFurnished: false,
      isActive: true,
      slug: "apartamento-copacabana-rio-de-janeiro-rj",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
      media: [],
    },
  ];
  return {
    propertyRows,
    property: {
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValueOnce(propertyRows).mockResolvedValue(propertyRows),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(1),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: "u1", name: "Agente ACME", email: "agent@acme.com" }),
    },
  };
});

vi.mock("@/lib/prisma/client", () => ({
  prismaUnscoped: {
    property: mocks.property,
    user: mocks.user,
    $transaction: vi.fn((q: Promise<unknown>[]) => Promise.all(q)),
  },
}));

vi.mock("@/lib/media/media-service", () => ({
  resolveMediaUrl: vi.fn(async (m: { url?: string | null }) => m.url ?? ""),
}));

import { searchListings, getPublicListing, listCities, listFeatured } from "@/lib/public/repository";

const prismaUnscoped = mocks as unknown as {
  property: { groupBy: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

function lastWhere(): Record<string, any> {
  const call = prismaUnscoped.property.findMany.mock.calls.at(-1);
  return (call?.[0]?.where ?? {}) as Record<string, any>;
}

describe("visibility contract", () => {
  it("applies the ACTIVE/tenant guard to every query", async () => {
    await searchListings({}, { page: 1, pageSize: 12, sort: "relevance" });
    const where = lastWhere();
    expect(where.status).toBe("ACTIVE");
    expect(where.isActive).toBe(true);
    expect(where.tenant).toEqual({ status: "ACTIVE" });
  });

  it("applies target/category/price filters", async () => {
    await searchListings({ target: "SALE", category: "APARTMENT", minPrice: 500000, maxPrice: 1000000 });
    const where = lastWhere();
    const and = (where.AND ?? []).map((c: any) => c);
    expect(and).toEqual(
      expect.arrayContaining([
        { target: "SALE" },
        { category: "APARTMENT" },
        { salePrice: { gte: expect.anything(), lte: expect.anything() } },
      ]),
    );
  });

  it("ranges rentPrice when target is RENT", async () => {
    await searchListings({ target: "RENT", minPrice: 3000 });
    const where = lastWhere();
    const and = (where.AND ?? []).map((c: any) => c);
    expect(and).toContainEqual({ rentPrice: { gte: expect.anything() } });
    expect(and.find((c: Record<string, unknown>) => c.salePrice)).toBeUndefined();
  });

  it("resolves listings to a serializable public view", async () => {
    const page = await searchListings({}, { page: 1, pageSize: 12, sort: "newest" });
    expect(page.total).toBe(1);
    expect(page.items[0]?.salePrice).toBe("750000.00");
    expect(page.items[0]?.city).toBe("Rio de Janeiro");
    expect(page.items[0]?.broker?.name).toBe("Agente ACME");
    expect(page.items[0]?.coverImage).toBeNull();
  });
});

describe("listCities", () => {
  it("maps grouped results to city slugs", async () => {
    prismaUnscoped.property.groupBy.mockResolvedValue([
      { city: "São Paulo", state: "SP", _count: { _all: 4 } },
    ]);
    const cities = await listCities();
    expect(cities).toHaveLength(1);
    expect(cities[0]?.slug).toBe("sao-paulo-sp");
    expect(cities[0]?.listingCount).toBe(4);
  });

  it("drops placeholder city rows", async () => {
    prismaUnscoped.property.groupBy.mockResolvedValue([
      { city: "—", state: "—", _count: { _all: 1 } },
    ]);
    const cities = await listCities();
    expect(cities).toHaveLength(0);
  });
});

describe("getPublicListing / listFeatured", () => {
  it("returns null for unknown slugs", async () => {
    const listing = await getPublicListing("nao-existe");
    expect(listing).toBeNull();
  });

  it("filters featured rows for the landing page", async () => {
    await listFeatured(3);
    const where = lastWhere();
    expect(where.isFeatured).toBe(true);
  });
});