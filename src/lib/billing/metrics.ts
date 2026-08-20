import type { BillingCycle, TenantStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import "../events/register";

/**
 * Master-Admin SaaS financial metrics.
 *
 * Every monetary figure is integer cents. MRR is the monthly-normalized value
 * of revenue-generating subscriptions (ACTIVE + PAST_DUE) — yearly cycles are
 * divided by 12 so all cohorts are directly comparable month-over-month.
 */

export interface FinancialSnapshot {
  generatedAt: string;
  period: { from: string; to: string };

  // Revenue
  mrrCents: number;
  arrCents: number;
  periodRevenueCents: number;
  pendingRevenueCents: number;
  revenueByPlan: Array<{
    planCode: string;
    planName: string;
    mrrCents: number;
    activeSubscriptions: number;
  }>;

  // Subscriptions / accounts
  subscriptionsByStatus: Array<{ status: TenantStatus; count: number }>;

  // Delinquency
  pastDueCount: number;
  pastDueAmountCents: number;
  blockedCount: number;

  // Churn
  churnedSubscriptions: number;
  churnRate: number;

  // Highlight add-on
  activeHighlights: number;
  highlightedProperties: number;
  highlightCreditsSold: number;
  highlightRevenueCents: number;
  highlightBalancesCents: number;

  // Lead engine conversion
  leadsDelivered: { realEstate: number; financial: number };

  // Marketplace health
  propertiesTotal: number;
  propertiesActive: number;
  propertiesSold: number;
}

export async function getFinancialSnapshot(
  range: { from?: Date; to?: Date } = {},
): Promise<FinancialSnapshot> {
  const to = range.to ?? new Date();
  const from = range.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [subscriptions, paidInvoices, openInvoices] = await Promise.all([
    // All tenant subscriptions incl. their plan.
    prismaUnscoped.tenantSubscription.findMany({
      include: { plan: { select: { code: true, name: true, billingCycle: true, priceCents: true } } },
    }),
    // Revenue actually collected in the window.
    prismaUnscoped.paymentInvoice.findMany({
      where: { status: "PAID", paidAt: { gte: from, lte: to } },
      select: { amountCents: true },
    }),
    // Money owed and not collected (OPEN/OVERDUE).
    prismaUnscoped.paymentInvoice.findMany({
      where: { status: { in: ["OPEN", "OVERDUE"] } },
      select: { amountCents: true, status: true },
    }),
  ]);

  const billing = await loadExtraDimensions(from, to);

  let mrrCents = 0;
  let pastDueCount = 0;
  let pastDueAmountCents = 0;
  let blockedCount = 0;
  const revenueByPlan = new Map<
    string,
    { planCode: string; planName: string; mrrCents: number; activeSubscriptions: number }
  >();
  const subscriptionsByStatus = new Map<TenantStatus, number>();

  for (const sub of subscriptions) {
    const planMonthly = normalizeMonthly(sub.plan.priceCents, sub.plan.billingCycle);
    const revenueBearing = sub.status === "ACTIVE" || sub.status === "PAST_DUE";
    if (revenueBearing) {
      mrrCents += planMonthly;
      const bucket = revenueByPlan.get(sub.plan.code) ?? {
        planCode: sub.plan.code,
        planName: sub.plan.name,
        mrrCents: 0,
        activeSubscriptions: 0,
      };
      bucket.mrrCents += planMonthly;
      bucket.activeSubscriptions += 1;
      revenueByPlan.set(sub.plan.code, bucket);
    }
    if (sub.status === "PAST_DUE") {
      pastDueCount += 1;
      pastDueAmountCents += sub.priceCents;
    }
    if (sub.status === "BLOCKED") blockedCount += 1;
    subscriptionsByStatus.set(sub.status, (subscriptionsByStatus.get(sub.status) ?? 0) + 1);
  }

  const pendingRevenueCents = openInvoices.reduce((sum, i) => sum + i.amountCents, 0);
  const periodRevenueCents = paidInvoices.reduce((sum, i) => sum + i.amountCents, 0);

  const revenueBearing = subscriptions.filter(
    (s) => s.status === "ACTIVE" || s.status === "PAST_DUE",
  );
  const churnRate =
    revenueBearing.length + billing.churnedSubscriptions > 0
      ? billing.churnedSubscriptions / (revenueBearing.length + billing.churnedSubscriptions)
      : 0;

  const [properties, propertyByStatus] = await loadPropertyStats();

  return {
    generatedAt: new Date().toISOString(),
    period: { from: from.toISOString(), to: to.toISOString() },

    mrrCents,
    arrCents: mrrCents * 12,
    periodRevenueCents,
    pendingRevenueCents,
    revenueByPlan: [...revenueByPlan.values()].sort((a, b) => b.mrrCents - a.mrrCents),

    subscriptionsByStatus: [...subscriptionsByStatus.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),

    pastDueCount,
    pastDueAmountCents,
    blockedCount,

    churnedSubscriptions: billing.churnedSubscriptions,
    churnRate,

    activeHighlights: billing.activeHighlights,
    highlightedProperties: billing.highlightedProperties,
    highlightCreditsSold: billing.highlightCreditsSold,
    highlightRevenueCents: billing.highlightRevenueCents,
    highlightBalancesCents: billing.highlightBalancesCents,

    leadsDelivered: billing.leadsDelivered,
    propertiesTotal: properties,
    propertiesActive: propertyByStatus.get("ACTIVE") ?? 0,
    propertiesSold: propertyByStatus.get("SOLD") ?? 0,
  };
}

function normalizeMonthly(priceCents: number, cycle: BillingCycle): number {
  return cycle === "YEARLY" ? Math.round(priceCents / 12) : priceCents;
}

async function loadExtraDimensions(from: Date, to: Date) {
  const [churnedSubscriptions, activeHighlights, soldCredits, deliveries, ledgerBalance] =
    await Promise.all([
      // Churn window: cancellations inside the period.
      prismaUnscoped.tenantSubscription.count({
        where: { status: "CANCELLED", cancelledAt: { gte: from, lte: to } },
      }),
      // Currently running highlight windows.
      prismaUnscoped.propertyHighlight.count({ where: { endsAt: { gt: new Date() } } }),
      // PAID highlight purchases (credits + BRL).
      prismaUnscoped.highlightPurchase.findMany({
        where: { status: "PAID" },
        select: { creditsBought: true, totalPriceCents: true },
      }),
      // Lead deliveries per scope in the window.
      prismaUnscoped.webhookDelivery.findMany({
        where: { status: "DELIVERED", deliveredAt: { gte: from, lte: to } },
        select: { endpoint: { select: { scope: true } } },
      }),
      // Sum of current highlight balances across tenants.
      prismaUnscoped.highlightCreditLedger.groupBy({
        by: ["tenantId"],
        _sum: { balanceAfter: true },
      }),
    ]);

  let leadsDelivered = { realEstate: 0, financial: 0 };
  for (const d of deliveries) {
    if (d.endpoint.scope === "FINANCIAL") leadsDelivered.financial += 1;
    else leadsDelivered.realEstate += 1;
  }

  const creditsSold = soldCredits.reduce((s, p) => s + p.creditsBought, 0);
  const highlightRevenueCents = soldCredits.reduce((s, p) => s + p.totalPriceCents, 0);
  const highlightBalancesCents = ledgerBalance.reduce(
    (s, row) => s + (row._sum.balanceAfter ?? 0),
    0,
  );

  return {
    churnedSubscriptions,
    activeHighlights,
    highlightedProperties: activeHighlights, // 1:1 property<->highlight window
    highlightCreditsSold: creditsSold,
    highlightRevenueCents,
    highlightBalancesCents,
    leadsDelivered,
  };
}

async function loadPropertyStats(): Promise<[number, Map<string, number>]> {
  const grouped = await prismaUnscoped.property.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const byStatus = new Map<string, number>();
  let total = 0;
  for (const g of grouped) {
    const count = g._count._all;
    byStatus.set(g.status, count);
    total += count;
  }
  return [total, byStatus];
}