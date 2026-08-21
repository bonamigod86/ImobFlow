import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { updatePlanFromDefinition } from "@/lib/billing/plans";
import { planPatchSchema } from "@/lib/validation/schemas";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * PATCH /api/admin/billing/plans/[code]  (MASTER-only)
 * Edit pricing/limits of a plan. Prices in integer cents. Deactivating a plan
 * never touches live subscriptions — only new signups stop referencing it.
 * Audits the change (Checklist Item 24 — alterações de planos).
 */

export const PATCH = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req, params) => {
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const body = planPatchSchema.parse(await req.json());
  const plan = await updatePlanFromDefinition(code!, body);

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PLAN_UPDATED,
    entity: "Plan",
    entityId: plan.code,
    tenantId: null,
    userId: ctx.userId,
    details: { code: plan.code, fields: Object.keys(body) },
  });

  return ok({ plan });
});