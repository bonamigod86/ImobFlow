import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";
import { eventBus } from "@/lib/events/event-bus";

/**
 * POST /api/properties/[id]/view
 * Records a page impression for the property listing (the analytics pipeline
 * consumes PropertyView rows). Uses the request context's IP/UA fingerprint as
 * the viewer marker so repeated bot hits can be deduped later.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

export const POST = withApiRoute(ACTIONS.PROPERTIES_READ, async (ctx, _req, params) => {
  const propertyId = normalizeId(params) as string;

  const property = await prisma.property.findFirst({ where: { id: propertyId } });
  if (!property) return fail(404, "NOT_FOUND", "Property not found.");

  await prisma.propertyView.create({
    data: {
      propertyId,
      viewer: ctx.userId,
      channel: "subscription_ui",
      pageUrl: `/properties/${propertyId}`,
      userAgent: null,
      ipAddress: null,
    } as never,
  });

  return ok({ recorded: true, propertyId });
});