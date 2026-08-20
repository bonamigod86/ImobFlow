import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { updatePlanFromDefinition } from "@/lib/billing/plans";
import { planPatchSchema } from "@/lib/validation/schemas";

/**
 * PATCH /api/admin/billing/plans/[code]  (MASTER-only)
 * Edit pricing/limits of a plan. Prices in integer cents. Deactivating a plan
 * never touches live subscriptions — only new signups stop referencing it.
 */

export const PATCH = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req, params) => {
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const body = planPatchSchema.parse(await req.json());
  const plan = await updatePlanFromDefinition(code!, body);
  return ok({ plan });
});