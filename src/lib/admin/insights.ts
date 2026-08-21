import type { LeadType, PropertyStatus, TenantStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";

/**
 * Master executive insights (Checklist Item 16).
 *
 * One aggregation surface for the platform-wide KPIs the manager expects:
 * clients (by type/status/new), properties (by status + highlights), leads
 * (real-estate vs financial, forwarded, by city, by agency, conversion) and the
 * financial snapshot forwarded from `getFinancialSnapshot`.
 *
 * Aggregations run on `prismaUnscoped` (platform-level — no tenant context) and
 * are pulled for a trailing window (`range`); "total" counters are all-time.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CityBucket {
  city: string;
  count: number;
}

export interface AgencyBucket {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  count: number;
}

export interface PlatformInsights {
  period: { from: string; to: string };
  clients: {
    total: number;
    agencies: number;
    brokers: number;
    paid: number;
    trial: number;
    pendingDue: number;
    pastDue: number;
    blocked: number;
    cancelled: number;
    newThisPeriod: number;
    byStatus: Array<{ status: TenantStatus; count: number }>;
  };
  properties: {
    total: number;
    active: number;
    newThisPeriod: number;
    sold: number;
    rented: number;
    inactive: number;
    highlighted: number;
  };
  leads: {
    total: number;
    inPeriod: number;
    realEstate: number;
    financial: number;
    forwarded: number;
    qualified: number;
    byCity: CityBucket[];
    byAgency: AgencyBucket[];
    conversion: {
      qualifiedRate: number | null;
      financialRate: number | null;
    };
  };
}

export async function getPlatformInsights(
  range: { from?: Date; to?: Date } = {},
): Promise<PlatformInsights> {
  const to = range.to ?? new Date();
  const from = range.from ?? new Date(to.getTime() - 30 * DAY_MS);

  const [
    byType,
    byStatus,
    newClients,
    propertyByStatus,
    newProperties,
    activeHighlights,
    leadsTotal,
    leadsInPeriod,
    forwarded,
    qualified,
    agencies,
    leadCities,
  ] = await Promise.all([
    prismaUnscoped.tenant.groupBy({ by: ["type"], _count: true }),
    prismaUnscoped.tenant.groupBy({ by: ["status"], _count: true }),
    prismaUnscoped.tenant.count({ where: { createdAt: { gte: from, lte: to } } }),
    prismaUnscoped.property.groupBy({ by: ["status"], _count: true }),
    prismaUnscoped.property.count({ where: { createdAt: { gte: from, lte: to } } }),
    prismaUnscoped.propertyHighlight.count({ where: { endsAt: { gt: new Date() } } }),
    prismaUnscoped.lead.count(),
    prismaUnscoped.lead.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { type: true, tenantId: true, payload: true, financeProfile: { select: { city: true } } },
    }),
    prismaUnscoped.webhookDelivery.count({
      where: { status: "DELIVERED", deliveredAt: { gte: from, lte: to } },
    }),
    prismaUnscoped.lead.count({
      where: { createdAt: { gte: from, lte: to }, status: { in: ["QUALIFIED", "WON"] } },
    }),
    prismaUnscoped.tenant.findMany({ select: { id: true, name: true, slug: true } }),
    prismaUnscoped.lead.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { tenantId: true, payload: true, financeProfile: { select: { city: true } } },
    }),
  ]);

  const statusMap = new Map<TenantStatus, number>();
  for (const s of byStatus) statusMap.set(s.status as TenantStatus, s._count);
  const typeMap = new Map<string, number>();
  for (const t of byType) typeMap.set(t.type, t._count);

  const propertyMap = new Map<PropertyStatus, number>();
  for (const p of propertyByStatus) propertyMap.set(p.status as PropertyStatus, p._count);

  // Leads in-period breakdown.
  let realEstate = 0;
  let financial = 0;
  for (const l of leadsInPeriod) {
    if (l.type === "FINANCIAL") financial += 1;
    else realEstate += 1;
  }

  // By city (payload.city / financeProfile.city), top 2000 in dev friendly cap.
  const cityCounts = new Map<string, number>();
  for (const l of leadCities) {
    const payload = (l.payload as Record<string, unknown> | null) ?? {};
    const city =
      (typeof payload.city === "string" && payload.city.trim() ? payload.city : undefined) ??
      (typeof payload.cidade === "string" && payload.cidade.trim() ? payload.cidade : undefined) ??
      l.financeProfile?.city;
    if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }

  // By agency (tenant).
  const agencyByName = new Map(agencies.map((a) => [a.id, a]));
  const agencyCounts = new Map<string, number>();
  for (const l of leadsInPeriod) {
    agencyCounts.set(l.tenantId, (agencyCounts.get(l.tenantId) ?? 0) + 1);
  }

  const inPeriod = leadsInPeriod.length;
  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    clients: {
      total: byType.reduce((n, t) => n + t._count, 0),
      agencies: typeMap.get("AGENCY") ?? 0,
      brokers: typeMap.get("BROKER") ?? 0,
      paid: (statusMap.get("ACTIVE") ?? 0) + (statusMap.get("PAST_DUE") ?? 0),
      trial: statusMap.get("TRIAL") ?? 0,
      pendingDue: statusMap.get("PENDING_DUE") ?? 0,
      pastDue: statusMap.get("PAST_DUE") ?? 0,
      blocked: statusMap.get("BLOCKED") ?? 0,
      cancelled: statusMap.get("CANCELLED") ?? 0,
      newThisPeriod: newClients,
      byStatus: [...statusMap.entries()]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
    },
    properties: {
      total: [...propertyMap.values()].reduce((a, b) => a + b, 0),
      active: propertyMap.get("ACTIVE") ?? 0,
      newThisPeriod: newProperties,
      sold: propertyMap.get("SOLD") ?? 0,
      rented: propertyMap.get("RENTED") ?? 0,
      inactive: propertyMap.get("INACTIVE") ?? 0,
      highlighted: activeHighlights,
    },
    leads: {
      total: leadsTotal,
      inPeriod: inPeriod,
      realEstate,
      financial,
      forwarded,
      qualified,
      byCity: [...cityCounts.entries()]
        .map(([city, count]) => ({ city, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      byAgency: [...agencyCounts.entries()]
        .map(([tenantId, count]) => ({
          tenantId,
          tenantName: agencyByName.get(tenantId)?.name ?? "—",
          tenantSlug: agencyByName.get(tenantId)?.slug ?? "—",
          count,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      conversion: {
        qualifiedRate: inPeriod > 0 ? qualified / inPeriod : null,
        financialRate: inPeriod > 0 ? financial / inPeriod : null,
      },
    },
  };
}
