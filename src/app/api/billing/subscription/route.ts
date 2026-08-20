import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { getTenantBilling } from "@/lib/billing/service";

/**
 * GET /api/billing/subscription  (tenant self-service)
 * The tenant's own billing picture: subscription, invoices, notifications.
 */

export const GET = withApiRoute(ACTIONS.BILLING_SELF, async (ctx) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    return ok({ tenant: null, subscription: null, invoices: [], notifications: [], highlightBalance: 0 });
  }
  const billing = await getTenantBilling(tenantId);
  return ok(billing);
});