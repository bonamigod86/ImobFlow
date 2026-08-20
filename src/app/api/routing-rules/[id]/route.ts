import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { routingRulePatchSchema } from "@/lib/validation/schemas";
import { prismaUnscoped } from "@/lib/prisma/client";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { ok, fail } from "@/lib/http/errors";

/**
 * PATCH /api/routing-rules/[id]
 * Update a rule owned by the calling tenant (or any for MASTER).
 */
export const PATCH = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, req, params) => {
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id) return fail(400, "BAD_REQUEST", "Rule id is required.");
  const body = routingRulePatchSchema.parse(await req.json());

  const existing = await assertOwnership(id, ctx.tenantId, ctx.role);
  if (!existing) return fail(404, "NOT_FOUND", "Rule não encontrada.");

  const rule = await prismaUnscoped.routingRule.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.priority !== undefined ? { priority: body.priority } : {}),
      ...("city" in body ? { city: body.city ?? null } : {}),
      ...("state" in body ? { state: body.state ?? null } : {}),
      ...("minMonthlyIncome" in body ? { minMonthlyIncome: body.minMonthlyIncome ?? null } : {}),
      ...("maxMonthlyIncome" in body ? { maxMonthlyIncome: body.maxMonthlyIncome ?? null } : {}),
      ...("minPropertyValue" in body ? { minPropertyValue: body.minPropertyValue ?? null } : {}),
      ...("maxPropertyValue" in body ? { maxPropertyValue: body.maxPropertyValue ?? null } : {}),
      ...("minTermMonths" in body ? { minTermMonths: body.minTermMonths ?? null } : {}),
      ...("maxTermMonths" in body ? { maxTermMonths: body.maxTermMonths ?? null } : {}),
      ...(body.endpointId !== undefined ? { endpointId: body.endpointId } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      isActive: true,
      priority: true,
      endpointId: true,
      updatedAt: true,
    },
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.ROUTING_RULE_UPDATED,
    entity: "RoutingRule",
    entityId: rule.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { name: rule.name },
  });

  return ok({ rule });
});

/**
 * DELETE /api/routing-rules/[id]
 * Remove a rule. Referenced endpoints are protected by ON DELETE RESTRICT,
 * so rows with deliveries can only be deactivated (set isActive=false).
 */
export const DELETE = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, _req, params) => {
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id) return fail(400, "BAD_REQUEST", "Rule id is required.");
  const existing = await assertOwnership(id, ctx.tenantId, ctx.role);
  if (!existing) return fail(404, "NOT_FOUND", "Rule não encontrada.");

  const rule = await prismaUnscoped.routingRule.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, name: true, isActive: true },
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.ROUTING_RULE_UPDATED,
    entity: "RoutingRule",
    entityId: rule.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { name: rule.name, deactivated: true },
  });

  return ok({ rule });
});

async function assertOwnership(
  id: string,
  tenantId: string | null,
  role: string,
): Promise<{ id: string; tenantId: string | null } | null> {
  const rule = await prismaUnscoped.routingRule.findUnique({
    where: { id },
    select: { id: true, tenantId: true },
  });
  if (!rule) return null;
  if (role === "MASTER") return rule;
  if (rule.tenantId !== tenantId) return null;
  return rule;
}