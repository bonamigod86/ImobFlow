import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { listPlans, createPlan } from "@/lib/billing/plans";
import { planCreateSchema } from "@/lib/validation/schemas";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * GET/POST /api/admin/billing/plans  (MASTER-only)
 * GET  — full plan catalogue, including deactivated plans (archives).
 * POST — create a brand-new plan (config-driven catalogue: no code changes).
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async () => {
  const plans = await listPlans({ includeInactive: true });
  return ok({ plans });
});

export const runtime = "nodejs";

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req) => {
  const body = planCreateSchema.parse(await req.json());
  const plan = await createPlan({
    ...body,
    description: body.description ?? null,
    maxProperties: body.maxProperties ?? null,
    maxUsers: body.maxUsers ?? null,
    maxLeads: body.maxLeads ?? null,
    billingCycle: body.billingCycle ?? "MONTHLY",
    priceCents: body.priceCents ?? 0,
    highlightCredits: body.highlightCredits ?? 0,
    gracePeriodDays: body.gracePeriodDays ?? 5,
    trialDays: body.trialDays ?? 14,
    isActive: body.isActive ?? true,
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PLAN_CREATED,
    entity: "Plan",
    entityId: plan.code,
    tenantId: null,
    userId: ctx.userId,
    details: { code: plan.code, name: plan.name, priceCents: plan.priceCents, billingCycle: plan.billingCycle },
  });

  return ok({ plan }, 201);
});