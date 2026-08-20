import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { eventBus } from "@/lib/events/event-bus";
import { duplicateProperty } from "@/lib/properties/property-service";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * POST /api/properties/[id]/duplicate
 * Creates a fresh copy of an existing listing (new code, reset flags; media is
 * not copied). Runs inside the ambient tenant context — ownership is enforced
 * by the Prisma tenant extension.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

const duplicateSchema = z.object({
  title: z.string().trim().max(255).optional(),
});

export const POST = withApiRoute(ACTIONS.PROPERTIES_CREATE, async (ctx, req, params) => {
  const id = normalizeId(params);
  const body = duplicateSchema.safeParse(await req.json());
  if (!body.success) {
    return fail(400, "VALIDATION_ERROR", "Invalid duplicate payload.");
  }

  const { property } = await duplicateProperty(id!, { title: body.data.title });

  eventBus.emit("property.duplicated", {
    tenantId: ctx.tenantId!,
    userId: ctx.userId,
    sourceId: id!,
    targetId: property.id,
    code: property.code,
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_CREATED,
    entity: "Property",
    entityId: property.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { code: property.code, duplicatedFrom: id },
  });

  return ok({ property }, 201);
});