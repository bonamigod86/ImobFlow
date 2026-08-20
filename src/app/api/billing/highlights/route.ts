import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { getHighlightBalance, listActiveHighlights, listPurchases } from "@/lib/billing/highlights";

/**
 * GET /api/billing/highlights  (tenant self-service — MANAGER+ / OWNER)
 * Highlight add-on dashboard data: credit balance, active windows, purchases.
 */

export const GET = withApiRoute(ACTIONS.BILLING_SELF, async (ctx) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    return ok({ balance: 0, highlights: [], purchases: [] });
  }
  const [balance, highlights, purchases] = await Promise.all([
    getHighlightBalance(tenantId),
    listActiveHighlights(tenantId),
    listPurchases(tenantId),
  ]);
  return ok({ balance, highlights, purchases });
});