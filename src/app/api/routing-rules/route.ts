import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { routingRuleSchema } from "@/lib/validation/schemas";
import { prismaUnscoped } from "@/lib/prisma/client";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { AppError, ok } from "@/lib/http/errors";

/**
 * GET /api/routing-rules
 * Financial-lead routing rules visible in the current context (tenant-owned +
 * platform defaults; all for MASTER).
 */
export const GET = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx) => {
  const where =
    ctx.tenantId === null
      ? {}
      : { OR: [{ tenantId: null }, { tenantId: ctx.tenantId }] };

  const items = await prismaUnscoped.routingRule.findMany({
    where,
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    include: {
      endpoint: { select: { id: true, name: true, strategy: true, scope: true, isActive: true } },
    },
  });

  return ok({ items });
});

/**
 * POST /api/routing-rules
 * Create a rule; owned by the calling tenant or the platform for MASTER.
 * Rules route FINANCIAL leads to a partner endpoint by priority + filters.
 */
export const POST = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, req) => {
  const body = routingRuleSchema.parse(await req.json());
  const tenantId = ctx.tenantId;

  const endpoint = await prismaUnscoped.webhookEndpoint.findFirst({
    where: { id: body.endpointId, isActive: true, scope: "FINANCIAL" },
    select: { id: true, tenantId: true },
  });
  if (!endpoint) {
    throw new AppError(
      400,
      "INVALID_ENDPOINT",
      "endpointId must reference an active FINANCIAL endpoint.",
    );
  }
  // Endpoint must be reachable by this rule owner.
  if (tenantId !== null && endpoint.tenantId !== null && endpoint.tenantId !== tenantId) {
    throw new AppError(403, "FORBIDDEN", "Cannot attach other subscribers' endpoints.");
  }

  const rule = await prismaUnscoped.routingRule.create({
    data: {
      tenantId,
      name: body.name,
      priority: body.priority,
      isActive: body.isActive,
      city: body.city ?? null,
      state: body.state ?? null,
      minMonthlyIncome: body.minMonthlyIncome ?? null,
      maxMonthlyIncome: body.maxMonthlyIncome ?? null,
      minPropertyValue: body.minPropertyValue ?? null,
      maxPropertyValue: body.maxPropertyValue ?? null,
      minTermMonths: body.minTermMonths ?? null,
      maxTermMonths: body.maxTermMonths ?? null,
      endpointId: body.endpointId,
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      isActive: true,
      priority: true,
      endpointId: true,
      createdAt: true,
    },
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.ROUTING_RULE_CREATED,
    entity: "RoutingRule",
    entityId: rule.id,
    tenantId: tenantId,
    userId: ctx.userId,
    details: { name: rule.name },
  });

  return ok({ rule }, 201);
});