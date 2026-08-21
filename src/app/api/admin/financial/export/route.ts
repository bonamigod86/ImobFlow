import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { TenantStatus } from "@prisma/client";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import {
  getPayableSubscriptions,
  subscriptionsToCsv,
  type PayableFilters,
} from "@/lib/admin/finance";

/**
 * GET /api/admin/financial/export  (MASTER-only)
 * Exports the subscription financial view (Checklist Item 17) as a pt-BR CSV
 * (semicolon-separated, UTF-8 with BOM — Excel-friendly). Honors the same
 * filters as the list endpoint (`status`, `plan`, `q`, `from`, `to`).
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async (_ctx, req: NextRequest) => {
  const filters: PayableFilters = {
    status: (req.nextUrl.searchParams.get("status") as TenantStatus | "" | null) ?? "",
    planCode: req.nextUrl.searchParams.get("plan") ?? "",
    search: req.nextUrl.searchParams.get("q") ?? undefined,
    from: req.nextUrl.searchParams.get("from") ?? undefined,
    to: req.nextUrl.searchParams.get("to") ?? undefined,
  };

  const { rows } = await getPayableSubscriptions(filters);
  const csv = subscriptionsToCsv(rows);

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="assinaturas-${stamp}.csv"`,
    },
  });
});