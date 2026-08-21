import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";

/**
 * GET /api/billing/plans  (tenant — BILLING_SELF)
 * Catálogo de planos ativos (definidos pelo MASTER) + a assinatura atual do
 * tenant, para a página "Planos e assinatura". Sem gateway de pagamento.
 */
export const GET = withApiRoute(ACTIONS.BILLING_SELF, async (ctx) => {
  const [plans, tenant] = await Promise.all([
    prismaUnscoped.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        priceCents: true,
        billingCycle: true,
        maxProperties: true,
        maxUsers: true,
        maxLeads: true,
        highlightCredits: true,
        gracePeriodDays: true,
        trialDays: true,
      },
    }),
    ctx.tenantId
      ? prismaUnscoped.tenant.findUnique({
          where: { id: ctx.tenantId },
          select: {
            planId: true,
            subscription: { select: { status: true, planId: true, trialEndsAt: true } },
          },
        })
      : null,
  ]);

  return ok({
    plans,
    currentPlanId: tenant?.subscription?.planId ?? tenant?.planId ?? null,
    subscription: tenant?.subscription ?? null,
  });
});