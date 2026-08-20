import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { getFinancialSnapshot } from "@/lib/billing/metrics";

/**
 * GET /api/admin/billing/metrics  (MASTER-only)
 * Platform SaaS financial snapshot — MRR, revenue, churn, delinquency,
 * highlight add-on economics and lead-engine conversion.
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const days = Math.min(Math.max(Number(params.get("days") ?? 30), 1), 365);
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const snapshot = await getFinancialSnapshot({ from, to });
  return ok({ snapshot });
});