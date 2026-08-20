import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { reorderGallery, setPrimaryMedia, deleteMedia } from "@/lib/media/media-service";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * PATCH /api/properties/[id]/gallery
 * Gallery manager: reorder (ordered media ids) and/or set the primary cover.
 * DELETE is per-item via /api/media/[mediaId].
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

const gallerySchema = z
  .object({
    orderedIds: z.array(z.string().min(1)).max(200),
    primaryId: z.string().min(1).optional(),
  })
  .refine((v) => !v.primaryId || v.orderedIds.includes(v.primaryId), {
    message: "primaryId must appear in orderedIds",
    path: ["primaryId"],
  });

export const PATCH = withApiRoute(ACTIONS.PROPERTIES_UPDATE, async (ctx, req, params) => {
  const propertyId = normalizeId(params);
  const body = gallerySchema.safeParse(await req.json());
  if (!body.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid gallery payload.");
  }

  await reorderGallery(propertyId as string, body.data.orderedIds);
  if (body.data.primaryId) {
    await setPrimaryMedia(propertyId as string, body.data.primaryId);
  }

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_UPDATED,
    entity: "Property",
    entityId: propertyId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { gallery: { count: body.data.orderedIds.length, primaryId: body.data.primaryId ?? null } },
  });

  return ok({ gallery: body.data });
});