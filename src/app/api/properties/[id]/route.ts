import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { propertyPatchSchema, type PropertyInput, type PropertyPatchInput } from "@/lib/validation/schemas";
import { prisma } from "@/lib/prisma/client";
import { ok, fail } from "@/lib/http/errors";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { eventBus } from "@/lib/events/event-bus";
import { withPublicIdentity } from "@/lib/properties/property-service";

/**
 * GET/PATCH/DELETE /api/properties/[id]
 * Single-property operations, all tenant-scoped via the ambient context.
 * Delete is audit-trailed both synchronously and via the domain event bus.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

function buildPatchData(body: PropertyPatchInput) {
  return {
    code: body.code,
    externalCode: body.externalCode ?? undefined,
    title: body.title,
    description: body.description ?? undefined,
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
    neighborhood: body.neighborhood ?? undefined,
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
  } as Prisma.PropertyUncheckedUpdateInput;
}

export const GET = withApiRoute(ACTIONS.PROPERTIES_READ, async (_ctx, _req, params) => {
  const property = await prisma.property.findFirst({
    where: { id: normalizeId(params) },
    include: { media: { orderBy: { sortOrder: "asc" } } },
  });
  if (!property) return fail(404, "NOT_FOUND", "Property not found.");
  return ok({ property });
});

export const PATCH = withApiRoute(ACTIONS.PROPERTIES_UPDATE, async (ctx, req, params) => {
  const body = propertyPatchSchema.safeParse(await req.json());
  if (!body.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid property payload.");
  }

  const id = normalizeId(params);
  const existing = await prisma.property.findFirst({ where: { id } });
  if (!existing) return fail(404, "NOT_FOUND", "Property not found.");

  // Recompute slug/searchText from the merged view so public URLs stay stable
  // when title/city changes but the caller doesn't resend a slug.
  const merged = { ...existing, ...body.data };
  const publicIdentity = await withPublicIdentity(merged as PropertyInput, existing.id);

  const updated = await prisma.property.update({
    where: { id: existing.id },
    data: { ...buildPatchData(body.data), ...publicIdentity },
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_UPDATED,
    entity: "Property",
    entityId: updated.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { code: updated.code, status: updated.status },
  });

  return ok({ property: updated });
});

export const DELETE = withApiRoute(ACTIONS.PROPERTIES_DELETE, async (ctx, _req, params) => {
  const property = await prisma.property.findFirst({ where: { id: normalizeId(params) } });
  if (!property) return fail(404, "NOT_FOUND", "Property not found.");

  // Tenant-extension confirms ownership; deleting by id is safe.
  await prisma.property.delete({ where: { id: property.id } });

  eventBus.emit("property.deleted", {
    tenantId: ctx.tenantId!,
    userId: ctx.userId,
    property: { id: property.id, code: property.code, title: property.title },
  });

  return ok({ deleted: true });
});