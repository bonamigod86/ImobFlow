import type { BillingCycle, TenantStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { requireTenantId } from "@/lib/tenant/context";

/**
 * DashboardAnalyticsService — Phase 2 subscriber dashboard aggregates (item 4).
 *
 * Every query runs inside the ambient tenant context; the tenant-extension
 * injects `tenantId`, so no raw tenant filters appear here. Aggregations use
 * the tenant's existing tables (Property, PropertyView, Lead, Plan, User,
 * TenantSubscription, PropertyHighlight, HighlightCreditLedger).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatusBreakdown {
  ACTIVE: number;
  INACTIVE: number;
  SOLD: number;
  RENTED: number;
}

export interface PlanUtilization {
  planCode: string;
  planName: string;
  maxProperties: number | null;
  usedProperties: number;
  maxUsers: number | null;
  usedUsers: number;
  maxLeads: number | null;
  usedLeads: number;
  /** Destaques (highlight) entitlement from the plan + current usage. */
  maxHighlights: number | null;
  usedHighlights: number;
  highlightBalance: number;
}

export interface SubscriptionSummary {
  status: TenantStatus;
  priceCents: number;
  billingCycle: BillingCycle;
  currentPeriodEnd: string | null;
  nextInvoiceDueAt: string | null;
  trialEndsAt: string | null;
}

export interface TopProperty {
  id: string;
  code: string;
  title: string;
  views7d: number;
  leads7d: number;
  leads30d: number;
  conversionRate: number; // leads / views (0..1)
}

export interface DashboardSnapshot {
  statusBreakdown: StatusBreakdown;
  utilization: PlanUtilization | null;
  subscription: SubscriptionSummary | null;
  views7d: number;
  views30d: number;
  leads7d: number;
  leads30d: number;
  conversion7d: number;
  conversion30d: number;
  /** Solicitações de visita (leads que agendaram visita — payload.schedule). */
  visits7d: number;
  visits30d: number;
  /** Contatos por WhatsApp (leads capturados via CTA wa.me — payload.channel). */
  whatsapp7d: number;
  whatsapp30d: number;
  topProperties: TopProperty[];
  topByLeads: TopProperty[];
}

function windowStart(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/** Peg a property's conversion (leads from that listing / views of it). */
function deltaRate(views: number, leads: number): number {
  if (views <= 0) return 0;
  return Math.min(1, leads / views);
}

/** Read the JSON payload and tell whether a given key exists / matches. */
function payloadHas(payload: unknown, key: string, value?: string): boolean {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (!(key in p)) return false;
  return value === undefined ? true : p[key] === value;
}

/**
 * Aggregate the snapshot inside the current tenant context.
 */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const tenantId = requireTenantId();
  const weekAgo = windowStart(7);
  const monthAgo = windowStart(30);

  const [
    statusRows,
    planRow,
    usedUsers,
    viewRows,
    subscription,
    usedHighlights,
    ledgerRow,
    leadRows,
    topByLeadsRows,
  ] = await Promise.all([
    // Status breakdown (live, authoritative listing state).
    prisma.property.groupBy({
      by: ["status"],
      where: { isActive: true },
      _count: { _all: true },
    }),
    // Plan + plan profile for utilization/destaques (Tenant is NOT tenant-scoped,
    // so it is resolved explicitly by the context tenant id).
    prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } }),
    prisma.user.count(),
    prisma.propertyView.findMany({
      where: { property: { isActive: true }, createdAt: { gte: monthAgo } },
      select: { propertyId: true, createdAt: true },
    }),
    // Assinatura ativa / vencimentos.
    prisma.tenantSubscription.findUnique({ where: { tenantId } }),
    // Imóveis atualmente em destaque.
    prisma.propertyHighlight.count({ where: { endsAt: { gt: new Date() } } }),
    // Saldo de créditos de destaque (último lançamento do ledger).
    prisma.highlightCreditLedger.findFirst({ orderBy: { createdAt: "desc" } }),
    // Leads dos últimos 30 dias para os funis de canal (visita / whatsapp).
    prisma.lead.findMany({
      where: { createdAt: { gte: monthAgo } },
      select: { createdAt: true, payload: true },
    }),
    // Imóveis com maior geração de leads (30 dias).
    prisma.lead.groupBy({
      by: ["propertyId"],
      where: { propertyId: { not: null }, createdAt: { gte: monthAgo } },
      _count: { _all: true },
      orderBy: { _count: { propertyId: "desc" } },
      take: 5,
    }),
  ]);

  const statusBreakdown: StatusBreakdown = {
    ACTIVE: 0,
    INACTIVE: 0,
    SOLD: 0,
    RENTED: 0,
  };
  for (const row of statusRows) {
    const status = row.status as keyof StatusBreakdown;
    statusBreakdown[status] = row._count._all ?? 0;
  }

  const usedProperties = await prisma.property.count({ where: { isActive: true } });

  const plan = planRow?.plan ?? null;
  const features = (plan?.features ?? {}) as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const utilization: PlanUtilization | null = plan
    ? {
        planCode: plan.code,
        planName: plan.name,
        maxProperties: plan.maxProperties ?? num(features.maxProperties) ?? null,
        usedProperties,
        maxUsers: plan.maxUsers ?? num(features.maxUsers) ?? null,
        usedUsers,
        maxLeads: plan.maxLeads ?? num(features.maxLeads) ?? null,
        usedLeads: leadRows.length,
        maxHighlights: plan.highlightCredits,
        usedHighlights,
        highlightBalance: ledgerRow?.balanceAfter ?? 0,
      }
    : null;

  const subscriptionSummary: SubscriptionSummary | null = subscription
    ? {
        status: subscription.status,
        priceCents: subscription.priceCents,
        billingCycle: subscription.billingCycle,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        nextInvoiceDueAt: subscription.nextInvoiceDueAt?.toISOString() ?? null,
        trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      }
    : null;

  const views7d = viewRows.filter((v) => v.createdAt >= weekAgo).length;
  const views30d = viewRows.length;

  const leads30d = leadRows.length;
  const leads7d = leadRows.filter((l) => l.createdAt >= weekAgo).length;
  const visits30d = leadRows.filter((l) => payloadHas(l.payload, "schedule")).length;
  const visits7d = leadRows.filter((l) => l.createdAt >= weekAgo && payloadHas(l.payload, "schedule")).length;
  const whatsapp30d = leadRows.filter((l) => payloadHas(l.payload, "channel", "whatsapp")).length;
  const whatsapp7d = leadRows.filter(
    (l) => l.createdAt >= weekAgo && payloadHas(l.payload, "channel", "whatsapp"),
  ).length;

  // Top properties by views30d using PropertyView window directly.
  const topIds = await prisma.propertyView.groupBy({
    by: ["propertyId"],
    where: { createdAt: { gte: monthAgo } },
    _count: { _all: true },
    orderBy: { _count: { propertyId: "desc" } },
    take: 8,
  });
  const topProperties = await Promise.all(
    topIds.map((row) => enrichTopProperty(row.propertyId, weekAgo, monthAgo)),
  );

  // Top properties by leads30d (lead count per listing).
  const topByLeads = (
    await Promise.all(
      topByLeadsRows.map(async (row) => {
        if (!row.propertyId) return null;
        return enrichTopProperty(row.propertyId, weekAgo, monthAgo);
      }),
    )
  ).filter((p): p is TopProperty => p !== null);

  return {
    statusBreakdown,
    utilization,
    subscription: subscriptionSummary,
    views7d,
    views30d,
    leads7d,
    leads30d,
    conversion7d: deltaRate(views7d, leads7d),
    conversion30d: deltaRate(views30d, leads30d),
    visits7d,
    visits30d,
    whatsapp7d,
    whatsapp30d,
    topProperties: topProperties.filter((p): p is TopProperty => p !== null),
    topByLeads,
  };
}

/** Property row + its engagement metrics for the top lists. */
async function enrichTopProperty(
  propertyId: string,
  weekAgo: Date,
  monthAgo: Date,
): Promise<TopProperty | null> {
  const property = await prisma.property.findFirst({ where: { id: propertyId } });
  if (!property) return null;
  const views7d = await countViewsFor(property.id, weekAgo);
  const leads7d = await prisma.lead.count({ where: { propertyId, createdAt: { gte: weekAgo } } });
  const leads30d = await prisma.lead.count({ where: { propertyId, createdAt: { gte: monthAgo } } });
  return {
    id: property.id,
    code: property.code,
    title: property.title,
    views7d,
    leads7d,
    leads30d,
    conversionRate: deltaRate(views7d, leads7d),
  };
}

function countViewsFor(propertyId: string, from: Date) {
  return prisma.propertyView.count({ where: { propertyId, createdAt: { gte: from } } });
}