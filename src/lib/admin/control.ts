import type { TenantStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { env } from "@/lib/config/env";
import { getFinancialSnapshot } from "@/lib/billing/metrics";
import { getPlatformInsights, type PlatformInsights } from "@/lib/admin/insights";
import { QueueManager } from "@/lib/queues/queue-manager";
import { DeadLetterQueue } from "@/lib/queues/dlq";
import { QueueName, type QueueName as QueueNameType } from "@/lib/queues/names";
import { pingRedis } from "@/lib/redis/client";

/**
 * Master executive panel aggregate — pulls together every platform dimension
 * (MRR/leads/health, tenants catalog, dunning watchlist, BullMQ queues and the
 * recent administrative audit trail) in a single MASTER-only query set.
 */

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface HealthState {
  db: "up" | "down";
  redis: "up" | "down";
  emailProvider: string;
  email: "up" | "diagnostic" | "down";
}

export interface MasterTenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  planCode: string | null;
  planName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  subscribedAt: string | null;
  nextInvoiceDueAt: string | null;
  pendingCents: number;
  manualBlockedAt: string | null;
}

export interface DunningRow {
  id: string;
  name: string;
  slug: string;
  planName: string | null;
  daysOverdue: number;
  pendingCents: number;
  graceEndsAt: string | null;
}

export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  tenantSlug: string | null;
  createdAt: string;
}

export interface MasterControlData {
  generatedAt: string;
  kpi: {
    mrrCents: number;
    mrrTrendPct: number | null;
    activeTenants: number;
    paidTenants: number;
    pastDueTenants: number;
    leadsThisMonth: number;
    subscriptionsByStatus: Array<{ status: TenantStatus; count: number }>;
  };
  health: HealthState;
  queues: {
    available: boolean;
    email: { name: string; counts: QueueCounts };
    totalActive: number;
    totalFailed: number;
    dlqFailed: number;
  };
  deliveries: {
    byStatus: Array<{ status: string; count: number }>;
    failedLast24h: number;
    stuckInFlight: number;
    avgAttempts: number | null;
  };
  tenants: MasterTenantRow[];
  dunning: DunningRow[];
  audit: AuditRow[];
  /** Checklist Item 16 — platform-wide KPI aggregation (clients/properties/leads/finance). */
  insights: PlatformInsights;
  /** Checklist Item 16/17 — financial snapshot surfaced for the master panels. */
  finance: {
    mrrCents: number;
    periodRevenueCents: number;
    pendingRevenueCents: number;
    pastDueCount: number;
    pastDueAmountCents: number;
    blockedCount: number;
    churnedSubscriptions: number;
    churnRate: number;
    revenueByPlan: Array<{ planCode: string; planName: string; mrrCents: number; activeSubscriptions: number }>;
    subscriptionsByStatus: Array<{ status: TenantStatus; count: number }>;
  };
}

const QUEUE_LIST: QueueNameType[] = [
  QueueName.LEAD_ROUTING,
  QueueName.WEBHOOK_TRANSMISSION,
  QueueName.MEDIA_PROCESSING,
  QueueName.PROPERTY_IMPORT,
  QueueName.BILLING_SYNC,
  QueueName.EMAIL_SEND,
];

const ADM_ACTIONS: readonly string[] = [
  "TENANT_CREATED",
  "TENANT_STATUS_CHANGED",
  "TENANT_MANUALLY_BLOCKED",
  "TENANT_MANUALLY_UNBLOCKED",
  "TENANT_PLAN_OVERRIDE_SET",
  "TENANT_PLAN_OVERRIDE_CLEARED",
  "TENANT_IMPERSONATED",
  "TENANT_PAYMENT_LINK_SENT",
  "PLAN_CREATED",
  "PLAN_UPDATED",
  "SUBSCRIPTION_PROVISIONED",
  "SUBSCRIPTION_PAST_DUE",
  "SUBSCRIPTION_BLOCKED",
  "SUBSCRIPTION_REACTIVATED",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Base URL for a tenant's subdomain derived from APP_URL. */
export function tenantBaseUrl(slug: string): string {
  const url = new URL(env.APP_URL);
  const host = url.hostname;
  const labels = host.split(".");
  if (labels.length === 1) {
    url.hostname = `${slug}.127.0.0.1.nip.io`;
  } else {
    labels[0] = slug;
    url.hostname = labels.join(".");
  }
  return url.origin;
}

export async function getMasterControlData(): Promise<MasterControlData> {
  const now = Date.now();
  const start = new Date(now - 30 * DAY_MS);
  const prevFrom = new Date(now - 60 * DAY_MS);
  const prevTo = new Date(now - 30 * DAY_MS);

  const [
    snapshot,
    prevSnapshot,
    openInvoices,
    tenantsQuery,
    leadsThisMonth,
    auditQuery,
    health,
    queues,
    deliveryMetrics,
    insights,
  ] = await Promise.all([
    // KPI revenue/MRR for the trailing 30 days.
    getFinancialSnapshot({ from: start, to: new Date(now) }),
    // Prior 30-day window (trend denominator).
    getFinancialSnapshot({ from: prevFrom, to: prevTo }),
    // Money owed and not collected (OPEN/OVERDUE) across every tenant.
    prismaUnscoped.paymentInvoice.findMany({
      where: { status: { in: ["OPEN", "OVERDUE"] } },
      select: { tenantId: true, amountCents: true, dueDate: true },
    }),
    // Tenants catalog with plan, subscription and owner contact.
    prismaUnscoped.tenant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        manualBlockedAt: true,
        plan: { select: { code: true, name: true } },
        subscription: {
          select: {
            createdAt: true,
            nextInvoiceDueAt: true,
            graceEndsAt: true,
            plan: { select: { name: true } },
          },
        },
        users: {
          where: { role: "OWNER" },
          select: { name: true, email: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
    // Platform-wide lead intake since the start of the month.
    prismaUnscoped.lead.count({
      where: { createdAt: { gte: new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1) } },
    }),
    // Recent administrative activity for the audit trail preview.
    prismaUnscoped.auditLog.findMany({
      where: { action: { in: [...ADM_ACTIONS] } },
      include: {
        user: { select: { email: true, name: true } },
        tenant: { select: { slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    loadHealth(),
    loadQueueMetrics(),
    loadDeliveryMetrics(),
    // Checklist Item 16 — platform KPIs (clients/properties/leads).
    getPlatformInsights({ from: start, to: new Date(now) }),
  ]);

  // Single-pass invoice aggregation (pending value + earliest due date).
  const pendingByTenant = new Map<string, number>();
  const earliestDueByTenant = new Map<string, number>();
  for (const inv of openInvoices) {
    pendingByTenant.set(inv.tenantId, (pendingByTenant.get(inv.tenantId) ?? 0) + inv.amountCents);
    const earliest = earliestDueByTenant.get(inv.tenantId);
    const due = inv.dueDate.getTime();
    if (earliest === undefined || due < earliest) earliestDueByTenant.set(inv.tenantId, due);
  }

  const kpiStatus = new Map<string, number>();
  for (const row of snapshot.subscriptionsByStatus) {
    kpiStatus.set(row.status, row.count);
  }

  const tenants: MasterTenantRow[] = tenantsQuery.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    planCode: t.plan?.code ?? null,
    planName: t.plan?.name ?? t.subscription?.plan?.name ?? null,
    ownerName: t.users[0]?.name ?? null,
    ownerEmail: t.users[0]?.email ?? null,
    subscribedAt: t.subscription?.createdAt?.toISOString() ?? null,
    nextInvoiceDueAt: t.subscription?.nextInvoiceDueAt?.toISOString() ?? null,
    pendingCents: pendingByTenant.get(t.id) ?? 0,
    manualBlockedAt: t.manualBlockedAt?.toISOString() ?? null,
  }));

  const dunning: DunningRow[] = tenantsQuery
    .filter((t) => t.status === "PAST_DUE")
    .map((t) => {
      const earliest = earliestDueByTenant.get(t.id);
      const daysOverdue =
        earliest !== undefined ? Math.max(0, Math.floor((now - earliest) / DAY_MS)) : 0;
      const fallbackGrace =
        earliest !== undefined ? earliest + 7 * DAY_MS : undefined;
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        planName: t.plan?.name ?? t.subscription?.plan?.name ?? null,
        daysOverdue,
        pendingCents: pendingByTenant.get(t.id) ?? 0,
        graceEndsAt:
          t.subscription?.graceEndsAt?.toISOString() ??
          (fallbackGrace === undefined ? null : new Date(fallbackGrace).toISOString()),
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  const audit: AuditRow[] = auditQuery.map((a) => ({
    id: a.id,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    actorEmail: a.user?.email ?? null,
    actorName: a.user?.name ?? null,
    tenantSlug: a.tenant?.slug ?? null,
    createdAt: a.createdAt.toISOString(),
  }));

  const mrrTrendPct =
    prevSnapshot.periodRevenueCents > 0
      ? ((snapshot.periodRevenueCents - prevSnapshot.periodRevenueCents) /
          prevSnapshot.periodRevenueCents) *
        100
      : null;

  return {
    generatedAt: new Date().toISOString(),
    kpi: {
      mrrCents: snapshot.mrrCents,
      mrrTrendPct,
      activeTenants: kpiStatus.get("ACTIVE") ?? 0,
      paidTenants: (kpiStatus.get("ACTIVE") ?? 0) + (kpiStatus.get("TRIAL") ?? 0),
      pastDueTenants: kpiStatus.get("PAST_DUE") ?? 0,
      leadsThisMonth,
      subscriptionsByStatus: snapshot.subscriptionsByStatus.map((s) => ({
        status: s.status as TenantStatus,
        count: s.count,
      })),
    },
    health,
    queues,
    deliveries: deliveryMetrics,
    tenants,
    dunning,
    audit,
    insights,
    finance: {
      mrrCents: snapshot.mrrCents,
      periodRevenueCents: snapshot.periodRevenueCents,
      pendingRevenueCents: snapshot.pendingRevenueCents,
      pastDueCount: snapshot.pastDueCount,
      pastDueAmountCents: snapshot.pastDueAmountCents,
      blockedCount: snapshot.blockedCount,
      churnedSubscriptions: snapshot.churnedSubscriptions,
      churnRate: snapshot.churnRate,
      revenueByPlan: snapshot.revenueByPlan,
      subscriptionsByStatus: snapshot.subscriptionsByStatus,
    },
  };
}

async function loadHealth(): Promise<HealthState> {
  let db: "up" | "down" = "up";
  try {
    await prismaUnscoped.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }
  const redisUp = await pingRedis();
  const provider = env.EMAIL_PROVIDER;
  const email: HealthState["email"] = provider === "console" ? "diagnostic" : "up";
  return {
    db,
    redis: redisUp ? "up" : "down",
    emailProvider: provider,
    email: redisUp ? email : "down",
  };
}

/** Integration-layer health: persisted webhook deliveries by status, failures
 *  in the last 24h, stuck IN_FLIGHT rows (orphaned jobs — reconciler target)
 *  and the average attempt count across deliveries. */
async function loadDeliveryMetrics() {
  const [
    byStatus,
    failedLast24h,
    stuckInFlight,
    attemptStats,
  ] = await Promise.all([
    prismaUnscoped.webhookDelivery.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prismaUnscoped.webhookDelivery.count({
      where: { status: "FAILED", updatedAt: { gte: new Date(Date.now() - DAY_MS) } },
    }),
    prismaUnscoped.webhookDelivery.count({
      where: { status: "IN_FLIGHT", updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
    }),
    prismaUnscoped.webhookDelivery.aggregate({ _avg: { attemptsCount: true } }),
  ]);

  return {
    byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
    failedLast24h,
    stuckInFlight,
    avgAttempts: attemptStats._avg.attemptsCount ?? null,
  };
}

async function loadQueueMetrics() {
  const zero: QueueCounts = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  const countsByQueue = new Map<QueueNameType, QueueCounts>();
  let totalActive = 0;
  let totalFailed = 0;
  let available = true;

  for (const name of QUEUE_LIST) {
    try {
      const counts = await QueueManager.get<never>(name).getJobCounts();
      const c: QueueCounts = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
      countsByQueue.set(name, c);
      totalActive += c.active;
      totalFailed += c.failed;
    } catch {
      available = false;
      countsByQueue.set(name, zero);
    }
  }

  let dlqFailed = 0;
  if (available) {
    for (const name of QUEUE_LIST) {
      try {
        dlqFailed += await DeadLetterQueue.queueFor(name).count();
      } catch {
        // a DLQ outage must not break the whole panel
      }
    }
  }

  return {
    available,
    email: {
      name: QueueName.EMAIL_SEND,
      counts: countsByQueue.get(QueueName.EMAIL_SEND) ?? zero,
    },
    totalActive,
    totalFailed,
    dlqFailed,
  };
}