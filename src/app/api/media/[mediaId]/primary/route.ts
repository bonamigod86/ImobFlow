import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";
import { setPrimaryMedia } from "@/lib/media/media-service";
import { eventBus } from "@/lib/events/event-bus";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * PATCH /api/media/[mediaId]/primary
 * Promotes one image to the gallery cover (demotes the previous primary).
 * Tenant-scoped through the ambient Prisma extension.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.mediaId;
  return Array.isArray(id) ? id[0] : id;
}

export const PATCH = withApiRoute(ACTIONS.PROPERTIES_UPDATE, async (ctx, _req, params) => {
  const mediaId = normalizeId(params) as string;

  const media = await prisma.propertyMedia.findUnique({ where: { id: mediaId } });
  if (!media) return fail(404, "NOT_FOUND", "Media not found.");

  await setPrimaryMedia(media.propertyId, mediaId);

  eventBus.emit("property.media_primary", {
    tenantId: ctx.tenantId!,
    userId: ctx.userId,
    propertyId: media.propertyId,
    mediaId,
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_UPDATED,
    entity: "PropertyMedia",
    entityId: mediaId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { propertyId: media.propertyId, primary: true },
  });

  return ok({ primary: true });
});