import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { getMasterControlData } from "@/lib/admin/control";

/**
 * GET /api/admin/control  (MASTER-only)
 * Single pull with every dimension the executive dashboard renders: KPIs,
 * dependency health, BullMQ/DLQ queue state, the tenants catalog, the dunning
 * watchlist and the recent administrative audit trail.
 */

export const runtime = "nodejs";

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async () => {
  const control = await getMasterControlData();
  return ok({ control });
});