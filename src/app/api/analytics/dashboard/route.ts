import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { getDashboardSnapshot } from "@/lib/analytics/dashboard";

/**
 * GET /api/analytics/dashboard
 * Tenant-scoped subscriber dashboard snapshot: listing-state breakdown, plan
 * utilization (properties/users/leads vs. plan limits), engagement windows and
 * top properties by views.
 */

export const GET = withApiRoute(ACTIONS.DASHBOARD_READ, async () => {
  const snapshot = await getDashboardSnapshot();
  return ok({ snapshot });
});