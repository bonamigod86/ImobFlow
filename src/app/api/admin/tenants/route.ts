import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";

/**
 * GET /api/admin/tenants  (MASTER-only)
 * Tenants catalog with their subscription snapshot — powers the Master billing
 * console (drill-down per tenant) and the platform debtor watchlist.
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req: NextRequest) => {
  const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase();
  const status = req.nextUrl.searchParams.get("status");

  const tenants = await prismaUnscoped.tenant.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { slug: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        status ? { status: status as never } : {},
      ],
    },
    include: {
      plan: { select: { code: true, name: true } },
      subscription: {
        select: {
          id: true,
          status: true,
          plan: { select: { name: true, priceCents: true } },
          priceCents: true,
          billingCycle: true,
          currentPeriodEnd: true,
          nextInvoiceDueAt: true,
          graceEndsAt: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  return ok({ tenants });
});