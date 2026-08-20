import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { setPropertyFeatured } from "@/lib/properties/property-service";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * PATCH /api/properties/[id]/featured
 * Spotlight toggle. Tenant-scoped through the ambient context.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

const featuredSchema = z.object({
  featured: z.boolean(),
});

export const PATCH = withApiRoute(ACTIONS.PROPERTIES_UPDATE, async (ctx, req, params) => {
  const body = featuredSchema.safeParse(await req.json());
  if (!body.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid featured payload.");
  }

  const { property } = await setPropertyFeatured(normalizeId(params) as string, body.data.featured);

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_UPDATED,
    entity: "Property",
    entityId: property.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { code: property.code, isFeatured: property.isFeatured },
  });

  return ok({ property });
});