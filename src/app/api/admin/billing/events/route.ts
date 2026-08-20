import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";

/**
 * GET /api/admin/billing/events  (MASTER-only)
 * Webhook ledger — every provider event ingested, its processing status and
 * any error. Read-only observability for the Master console.
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const status = params.get("status");
  const limit = Math.min(Math.max(Number(params.get("limit") ?? 100), 1), 500);
  const events = await prismaUnscoped.billingEvent.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { receivedAt: "desc" },
    take: limit,
  });
  return ok({ events });
});