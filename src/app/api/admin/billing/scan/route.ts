import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { runGlobalBillingScan } from "@/lib/billing/dunning";
import { runGlobalRenewalScan } from "@/lib/billing/renewals";
import { expireDueHighlights } from "@/lib/billing/highlights";

/**
 * POST /api/admin/billing/scan  (MASTER-only)
 * Trigger the recurring + dunning sweep on demand (the daily worker also runs
 * it). Useful to demo renewal invoicing / grace-expiry / notifications without
 * waiting for 02:00.
 */

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async () => {
  const renewal = await runGlobalRenewalScan();
  const scan = await runGlobalBillingScan();
  const highlightsExpired = await expireDueHighlights();
  return ok({ renewal, scan, highlightsExpired });
});