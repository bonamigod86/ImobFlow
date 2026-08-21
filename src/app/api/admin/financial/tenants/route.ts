import type { NextRequest } from "next/server";
import type { TenantStatus } from "@prisma/client";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import {
  getPayableSubscriptions,
  payablesPlanOptions,
  type PayableFilters,
} from "@/lib/admin/finance";

/**
 * GET /api/admin/financial/tenants  (MASTER-only)
 * Subscription financial list (Checklist Item 17) with filters: status, plan,
 * free-text search and a payment/contract period. Returns the rows plus
 * per-status totals and the plan options for the filter UI.
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async (_ctx, req: NextRequest) => {
  const filters: PayableFilters = {
    status: (req.nextUrl.searchParams.get("status") as TenantStatus | "" | null) ?? "",
    planCode: req.nextUrl.searchParams.get("plan") ?? "",
    search: req.nextUrl.searchParams.get("q") ?? undefined,
    from: req.nextUrl.searchParams.get("from") ?? undefined,
    to: req.nextUrl.searchParams.get("to") ?? undefined,
  };

  const [data, plans] = await Promise.all([
    getPayableSubscriptions(filters),
    payablesPlanOptions(),
  ]);

  return ok({ rows: data.rows, byStatus: data.byStatus, totals: data.totals, plans });
});