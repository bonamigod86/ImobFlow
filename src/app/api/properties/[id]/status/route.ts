import { z } from "zod";
import type { PropertyStatus } from "@prisma/client";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";
import { setPropertyStatus, softDeleteProperty, restoreProperty } from "@/lib/properties/property-service";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * PATCH /api/properties/[id]/status
 * Lifecycle transitions: change listing status, soft-delete (unlist) and
 * restore. All tenant-scoped through the ambient context.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

const VALID_STATUSES = ["ACTIVE", "INACTIVE", "SOLD", "RENTED"] as const;

const statusSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = withApiRoute(ACTIONS.PROPERTIES_UPDATE, async (ctx, req, params) => {
  const id = normalizeId(params);
  const body = statusSchema.safeParse(await req.json());
  if (!body.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid status payload.");
  }
  if (body.data.status == null && body.data.isActive == null) {
    return fail(400, "VALIDATION_ERROR", "Provide 'status' and/or 'isActive'.");
  }

  // Soft delete / restore handled via the lifecycle-specific actions
  // (they set status synergistically), while plain transitions go to setStatus.
  if (body.data.isActive === false) {
    const { property } = await softDeleteProperty(id as string);
    AuditService.logAsync({
      action: AUDIT_ACTIONS.PROPERTY_DELETED,
      entity: "Property",
      entityId: property.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      details: { code: property.code, softDelete: true },
    });
    return ok({ property });
  }
  if (body.data.isActive === true && body.data.status == null) {
    const { property } = await restoreProperty(id as string);
    AuditService.logAsync({
      action: AUDIT_ACTIONS.PROPERTY_UPDATED,
      entity: "Property",
      entityId: property.id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      details: { code: property.code, restored: true },
    });
    return ok({ property });
  }

  const { property } = await setPropertyStatus(id as string, body.data.status as PropertyStatus);
  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_UPDATED,
    entity: "Property",
    entityId: property.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { code: property.code, status: property.status },
  });

  return ok({ property });
});