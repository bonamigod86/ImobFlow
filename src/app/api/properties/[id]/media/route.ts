import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { registerUpload } from "@/lib/media/media-service";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * POST /api/properties/[id]/media
 * Registers a media row and hands back a presigned PUT URL; the client then
 * streams bytes straight to object storage and the processing queue picks the
 * object up asynchronously.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

const uploadSchema = z.object({
  kind: z.enum(["IMAGE", "VIDEO"]).optional().default("IMAGE"),
  mimeType: z.string().trim().max(120).optional(),
  sizeBytes: z.coerce.number().int().nonnegative().max(2_147_483_647).optional(),
});

export const POST = withApiRoute(ACTIONS.PROPERTIES_UPDATE, async (ctx, req, params) => {
  const propertyId = normalizeId(params);
  const body = uploadSchema.safeParse(await req.json());
  if (!body.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid upload payload.");
  }

  const { mediaId, uploadUrl, objectKey } = await registerUpload({
    propertyId: propertyId as string,
    kind: body.data.kind,
    mimeType: body.data.mimeType,
    sizeBytes: body.data.sizeBytes,
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_UPDATED,
    entity: "PropertyMedia",
    entityId: mediaId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { propertyId, kind: body.data.kind, objectKey },
  });

  return ok({ mediaId, uploadUrl, objectKey }, 202);
});