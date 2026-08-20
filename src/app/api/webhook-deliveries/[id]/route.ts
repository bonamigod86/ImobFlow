import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { prismaUnscoped } from "@/lib/prisma/client";
import { ok, fail } from "@/lib/http/errors";

/**
 * GET /api/webhook-deliveries/[id]
 * Full delivery record with every transmission-attempt execution log
 * (status, payload, signature, response, latency). Tenant-scoped.
 */
export const GET = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, _req, params) => {
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const delivery = await prismaUnscoped.webhookDelivery.findUnique({
    where: { id },
    include: {
      endpoint: {
        select: { id: true, name: true, scope: true, strategy: true, method: true },
      },
      lead: { select: { id: true, name: true, email: true, type: true } },
      attempts: { orderBy: { attemptNumber: "asc" } },
    },
  });

  if (!delivery) return fail(404, "NOT_FOUND", "Delivery não encontrada.");
  if (ctx.tenantId !== null && delivery.tenantId !== ctx.tenantId) {
    return fail(404, "NOT_FOUND", "Delivery não encontrada.");
  }

  return ok({ delivery });
});