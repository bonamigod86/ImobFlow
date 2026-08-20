import type { NextRequest } from "next/server";
import type { WebhookDeliveryStatus } from "@prisma/client";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { queryPageSchema } from "@/lib/validation/schemas";
import { prismaUnscoped } from "@/lib/prisma/client";
import { ok } from "@/lib/http/errors";

const VALID_STATUSES = ["PENDING", "IN_FLIGHT", "DELIVERED", "FAILED", "DEAD_LETTERED"] as const;

/**
 * GET /api/webhook-deliveries
 * Outbound webhook deliveries (aggregate) with attempt counts. Scoped to the
 * calling tenant; MASTER sees all. `status` filter optional.
 */
export const GET = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, req) => {
  const { page, pageSize } = queryPageSchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const statusRaw = new URL(req.url).searchParams.get("status") ?? undefined;
  const status = VALID_STATUSES.includes(statusRaw as (typeof VALID_STATUSES)[number])
    ? (statusRaw as WebhookDeliveryStatus)
    : undefined;

  const tenantWhere = ctx.tenantId === null ? {} : { tenantId: ctx.tenantId };
  const where = status ? { ...tenantWhere, status } : tenantWhere;

  const [items, total] = await prismaUnscoped.$transaction([
    prismaUnscoped.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        endpoint: { select: { id: true, name: true, scope: true, strategy: true } },
        _count: { select: { attempts: true } },
      },
    }),
    prismaUnscoped.webhookDelivery.count({ where }),
  ]);

  return ok({ items, pagination: { page, pageSize, total } });
});