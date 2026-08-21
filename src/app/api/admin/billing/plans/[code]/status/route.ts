import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { setPlanActive } from "@/lib/billing/plans";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * POST /api/admin/billing/plans/[code]/status  (MASTER-only)
 * Activate / deactivate a plan. Deactivation is archival-only.
 * Audits activation/deactivation (Checklist Item 24 — alterações de planos).
 */

const bodySchema = z.object({ isActive: z.boolean() }).strict();

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req, params) => {
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const body = bodySchema.parse(await req.json());
  const plan = await setPlanActive(code!, body.isActive);

  AuditService.logAsync({
    action: body.isActive ? AUDIT_ACTIONS.PLAN_UPDATED : AUDIT_ACTIONS.PLAN_DEACTIVATED,
    entity: "Plan",
    entityId: plan.code,
    tenantId: null,
    userId: ctx.userId,
    details: { code: plan.code, isActive: plan.isActive },
  });

  return ok({ plan });
});