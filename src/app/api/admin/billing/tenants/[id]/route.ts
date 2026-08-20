import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { getTenantBilling } from "@/lib/billing/service";

/**
 * GET /api/admin/billing/tenants/[id]  (MASTER-only)
 * Full billing picture of one tenant: subscription, invoices, notifications.
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req, params) => {
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const billing = await getTenantBilling(tenantId!);
  return ok(billing);
});