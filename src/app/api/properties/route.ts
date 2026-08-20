import type { NextRequest } from "next/server";
import { Prisma, type PropertyStatus } from "@prisma/client";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { propertySchema, queryPageSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/prisma/client";
import { ok } from "@/lib/http/errors";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { withPublicIdentity } from "@/lib/properties/property-service";

/**
 * GET/POST /api/properties
 * Tenant-isolated property collection. Every query runs inside the ambient
 * tenant context registered by withApiRoute — the Prisma extension injects
 * `tenantId`, so handlers never reference a tenant.
 */

const VALID_STATUSES = ["ACTIVE", "INACTIVE", "SOLD", "RENTED"] as const;
const VALID_TARGETS = ["SALE", "RENT", "BOTH"] as const;
const VALID_CATEGORIES = [
  "APARTMENT",
  "HOUSE",
  "COMMERCIAL",
  "LAND",
  "FARM",
  "OFFICE",
  "GARAGE",
  "OTHER",
] as const;

export const GET = withApiRoute(ACTIONS.PROPERTIES_READ, async (_ctx, req) => {
  const { page, pageSize } = queryPageSchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const params = new URL(req.url).searchParams;
  const statusRaw = params.get("status");
  const status = VALID_STATUSES.includes(statusRaw as PropertyStatus)
    ? (statusRaw as PropertyStatus)
    : undefined;
  const category = VALID_CATEGORIES.includes(params.get("category") as (typeof VALID_CATEGORIES)[number])
    ? (params.get("category") as (typeof VALID_CATEGORIES)[number])
    : undefined;
  const target = VALID_TARGETS.includes(params.get("target") as (typeof VALID_TARGETS)[number])
    ? (params.get("target") as (typeof VALID_TARGETS)[number])
    : undefined;
  const featured = params.get("featured");
  const active = params.get("active");

  const where: Prisma.PropertyWhereInput = {
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(target ? { target } : {}),
    ...(featured ? { isFeatured: featured === "true" } : {}),
    ...(active ? { isActive: active === "true" } : {}),
  };
  const [rawItems, total] = await prisma.$transaction([
    prisma.property.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        media: {
          where: { kind: "IMAGE", status: "READY" },
          orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          take: 1,
        },
      },
    }),
    prisma.property.count({ where }),
  ]);

  const items = rawItems.map(({ media, ...property }) => ({
    ...property,
    coverImage: media[0]?.url ?? null,
  }));

  return ok({ items, pagination: { page, pageSize, total } });
});

export const POST = withApiRoute(ACTIONS.PROPERTIES_CREATE, async (ctx, req) => {
  const body = propertySchema.parse(await req.json());
  const publicIdentity = await withPublicIdentity(body, undefined);
  const property = await prisma.property.create({
    data: {
      code: body.code,
      externalCode: body.externalCode ?? null,
      title: body.title,
      description: body.description ?? null,
      target: body.target,
      category: body.category,
      status: body.status,
      salePrice: body.salePrice ?? null,
      rentPrice: body.rentPrice ?? null,
      condoFee: body.condoFee ?? null,
      propertyTax: body.propertyTax ?? null,
      address: body.address ?? null,
      number: body.number ?? null,
      city: body.city,
      state: body.state,
      neighborhood: body.neighborhood ?? null,
      zipCode: body.zipCode ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      area: body.area ?? null,
      bedrooms: body.bedrooms ?? null,
      suites: body.suites ?? null,
      bathrooms: body.bathrooms ?? null,
      parkingSpots: body.parkingSpots ?? null,
      isFeatured: body.isFeatured,
      isFurnished: body.isFurnished,
      isActive: body.isActive,
      ...publicIdentity,
    } as Prisma.PropertyUncheckedCreateInput,
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_CREATED,
    entity: "Property",
    entityId: property.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { code: property.code, title: property.title, target: property.target },
  });

  return ok({ property }, 201);
});