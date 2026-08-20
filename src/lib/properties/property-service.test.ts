import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * PropertyManagementService tests — mock the tenant-scoped Prisma client to
 * verify the engine operations (duplicate, status transition, soft delete,
 * featured toggle) make the expected calls without touching PostgreSQL.
 */

const mocks = vi.hoisted(() => ({
  property: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  tenant: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/prisma/client", () => ({
  prisma: {
    property: mocks.property,
    $transaction: vi.fn((q) => q),
  },
  prismaUnscoped: {
    property: {
      findUnique: mocks.property.findUnique,
      count: mocks.property.count,
    },
    tenant: {
      findUnique: mocks.tenant.findUnique,
    },
  },
}));

import {
  duplicateProperty,
  setPropertyStatus,
  setPropertyFeatured,
  softDeleteProperty,
} from "@/lib/properties/property-service";

const baseProperty = {
  id: "p1",
  tenantId: "t1",
  code: "ACA-001",
  externalCode: null,
  title: "Apartamento Copacabana",
  description: null,
  target: "SALE",
  category: "APARTMENT",
  status: "ACTIVE",
  salePrice: new Prisma.Decimal("750000"),
  rentPrice: null,
  condoFee: new Prisma.Decimal("850"),
  propertyTax: null,
  address: "Av. Atlântica 1000",
  number: null,
  city: "Rio de Janeiro",
  state: "RJ",
  zipCode: null,
  latitude: null,
  longitude: null,
  area: new Prisma.Decimal("68"),
  bedrooms: 2,
  suites: 1,
  bathrooms: 2,
  parkingSpots: 1,
  isFeatured: true,
  isFurnished: false,
  isActive: true,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("PropertyManagementService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tenant.findUnique.mockResolvedValue({ plan: { maxProperties: null } });
    mocks.property.count.mockResolvedValue(0);
  });

  it("duplicates a property with a fresh code and reset flags", async () => {
    mocks.property.findUnique.mockResolvedValue(baseProperty);
    mocks.property.findMany.mockResolvedValue([]);
    mocks.property.create.mockImplementation((args: { data: Record<string, unknown> }) => ({
      ...baseProperty,
      ...(args.data as object),
      id: "p2",
    }));

    const { property, changed } = await duplicateProperty("p1");

    expect(mocks.property.findUnique).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(property.code).toBe("ACA-001-01");
    expect(property.title).toBe("Apartamento Copacabana (cópia)");
    expect(property.isFeatured).toBe(false);
    expect(property.isActive).toBe(true);
    expect(changed).toContain("code");
  });

  it("honors an explicit duplicate title", async () => {
    mocks.property.findUnique.mockResolvedValue(baseProperty);
    mocks.property.findMany.mockResolvedValue([]);
    mocks.property.create.mockResolvedValue(baseProperty);

    await duplicateProperty("p1", { title: "Réplica" });
    const createArgs = mocks.property.create.mock.calls[0]![0] as { data: { title: string } };
    expect(createArgs.data.title).toBe("Réplica");
  });

  it("transitions status and reports the change", async () => {
    mocks.property.update.mockResolvedValue({ ...baseProperty, status: "SOLD" });
    const { property, changed } = await setPropertyStatus("p1", "SOLD");
    expect(mocks.property.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1" }, data: { status: "SOLD" } }),
    );
    expect(property.status).toBe("SOLD");
    expect(changed).toEqual(["status"]);
  });

  it("soft-deletes by flipping isActive and status to INACTIVE", async () => {
    mocks.property.update.mockResolvedValue({ ...baseProperty, isActive: false, status: "INACTIVE" });
    const { changed } = await softDeleteProperty("p1");
    expect(mocks.property.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false, status: "INACTIVE" } }),
    );
    expect(changed).toEqual(expect.arrayContaining(["isActive", "status"]));
  });

  it("toggles featured", async () => {
    mocks.property.update.mockResolvedValue({ ...baseProperty, isFeatured: false });
    const { property } = await setPropertyFeatured("p1", false);
    expect(property.isFeatured).toBe(false);
    expect(mocks.property.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isFeatured: false } }),
    );
  });

  it("surfaces P2025 when the source property does not exist", async () => {
    mocks.property.findUnique.mockResolvedValue(null);
    await expect(duplicateProperty("missing")).rejects.toMatchObject({
      code: "P2025",
    });
  });
});