import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { setPlanActive } from "@/lib/billing/plans";

/**
 * POST /api/admin/billing/plans/[code]/status  (MASTER-only)
 * Activate / deactivate a plan. Deactivation is archival-only.
 */

const bodySchema = z.object({ isActive: z.boolean() }).strict();

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req, params) => {
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const body = bodySchema.parse(await req.json());
  const plan = await setPlanActive(code!, body.isActive);
  return ok({ plan });
});