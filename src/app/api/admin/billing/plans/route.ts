import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { listPlans } from "@/lib/billing/plans";

/**
 * GET /api/admin/billing/plans  (MASTER-only)
 * Full plan catalogue, including deactivated plans (archives).
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async () => {
  const plans = await listPlans({ includeInactive: true });
  return ok({ plans });
});