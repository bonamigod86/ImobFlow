import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";
import { deleteMedia } from "@/lib/media/media-service";
import { eventBus } from "@/lib/events/event-bus";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * DELETE /api/media/[mediaId]
 * Removes a media row AND its stored objects (original + each processed
 * variant). Tenant-boundary enforced by the ambient Prisma extension.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

export const DELETE = withApiRoute(ACTIONS.PROPERTIES_UPDATE, async (ctx, _req, params) => {
  const mediaId = normalizeId(params) as string;

  const media = await prisma.propertyMedia.findUnique({ where: { id: mediaId } });
  if (!media) return fail(404, "NOT_FOUND", "Media not found.");

  const propertyId = media.propertyId;
  await deleteMedia(mediaId);

  eventBus.emit("property.media_deleted", {
    tenantId: ctx.tenantId!,
    userId: ctx.userId,
    propertyId,
    mediaId,
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_UPDATED,
    entity: "PropertyMedia",
    entityId: mediaId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { propertyId, deleted: true },
  });

  return ok({ deleted: true });
});