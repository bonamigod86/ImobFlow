import { prisma } from "@/lib/prisma/client";
import { requireTenantId } from "@/lib/tenant/context";

/**
 * DashboardAnalyticsService — Phase 2 subscriber dashboard aggregates.
 *
 * Every query runs inside the ambient tenant context; the tenant-extension
 * injects `tenantId`, so no raw tenant filters appear here. Aggregations use
 * the tenant's existing tables (Property, PropertyView, Lead, Plan, User).
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
}

export interface TopProperty {
  id: string;
  code: string;
  title: string;
  views7d: number;
  leads7d: number;
  conversionRate: number; // leads / views (0..1)
}

export interface DashboardSnapshot {
  statusBreakdown: StatusBreakdown;
  utilization: PlanUtilization | null;
  views7d: number;
  views30d: number;
  leads7d: number;
  leads30d: number;
  conversion7d: number;
  conversion30d: number;
  topProperties: TopProperty[];
}

function windowStart(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

/** Peg a property's conversion (leads from that listing / views of it). */
function deltaRate(views: number, leads: number): number {
  if (views <= 0) return 0;
  return Math.min(1, leads / views);
}

/**
 * Aggregate the snapshot inside the current tenant context.
 * Queries the tenant's live tables directly (no rollups yet — the derived
 * PropertyPattern table is reserved for the scheduled trend worker in a
 * future milestone).
 */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  requireTenantId();

  const [statusRows, planRow, usedUsers, usedLeadsCount, viewRows] = await Promise.all([
    // Status breakdown (live, authoritative listing state).
    prisma.property.groupBy({
      by: ["status"],
      where: { isActive: true },
      _count: { _all: true },
    }),
    // Plan + property counts for utilization.
    prisma.tenant.findFirst({ include: { plan: true } }),
    prisma.user.count(),
    prisma.lead.count(),
    prisma.propertyView.findMany({
      where: { property: { isActive: true }, createdAt: { gte: windowStart(30) } },
      select: { propertyId: true },
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

  const features = (planRow?.plan.features ?? {}) as Record<string, unknown>;
  const utilization: PlanUtilization | null = planRow
    ? {
        planCode: planRow.plan.code,
        planName: planRow.plan.name,
        maxProperties: typeof features.maxProperties === "number" ? features.maxProperties : null,
        usedProperties,
        maxUsers: typeof features.maxUsers === "number" ? features.maxUsers : null,
        usedUsers,
        maxLeads: typeof features.maxLeads === "number" ? features.maxLeads : null,
        usedLeads: usedLeadsCount,
      }
    : null;

  const views7d = await countViews(7);
  const views30d = viewRows.length;
  const leads7d = await countLeads(7);
  const leads30d = await countLeads(30);

  // Top properties by views30d using PropertyView window directly.
  const topIds = await prisma.propertyView.groupBy({
    by: ["propertyId"],
    where: { createdAt: { gte: windowStart(30) } },
    _count: { _all: true },
    orderBy: { _count: { propertyId: "desc" } },
    take: 8,
  });
  const topProps = await Promise.all(
    topIds.map(async (row) => {
      const property = await prisma.property.findFirst({
        where: { id: row.propertyId },
      });
      if (!property) return null;
      const views7d = await countViewsFor(property.id, 7);
      const leads7d = await countLeadsFor(property.id, 7);
      return {
        id: property.id,
        code: property.code,
        title: property.title,
        views7d,
        leads7d,
        conversionRate: deltaRate(views7d, leads7d),
      };
    }),
  );

  return {
    statusBreakdown,
    utilization,
    views7d,
    views30d,
    leads7d,
    leads30d,
    conversion7d: deltaRate(views7d, leads7d),
    conversion30d: deltaRate(views30d, leads30d),
    topProperties: topProps.filter((p): p is TopProperty => p !== null),
  };
}

async function countViews(days: number) {
  return prisma.propertyView.count({ where: { createdAt: { gte: windowStart(days) } } });
}
function countViewsFor(propertyId: string, days: number) {
  return prisma.propertyView.count({
    where: { propertyId, createdAt: { gte: windowStart(days) } },
  });
}
function countLeads(days: number) {
  return prisma.lead.count({ where: { createdAt: { gte: windowStart(days) } } });
}
function countLeadsFor(propertyId: string, days: number) {
  return prisma.lead.count({ where: { propertyId, createdAt: { gte: windowStart(days) } } });
}