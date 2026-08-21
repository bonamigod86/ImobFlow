import type { BillingCycle, PaymentInvoiceStatus, TenantStatus, TenantType } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";

/**
 * Subscription financial management (Checklist Item 17).
 *
 * This is NOT an accounting engine — it's a complete operational view of SaaS
 * subscriptions: client, plan, value, status, contract date, last payment,
 * next due, invoice history summary (approved / overdue / open) and per-status
 * totals — ready to be filtered and exported.
 */

export interface PayableFilters {
  status?: TenantStatus | "";
  planCode?: string | "";
  search?: string;
  from?: string; // ISO — filters collected (PAID) payments & new contracts
  to?: string;
}

export interface PayableSubscriptionRow {
  tenantId: string;
  name: string;
  slug: string;
  type: TenantType;
  planName: string | null;
  priceCents: number;
  billingCycle: BillingCycle;
  status: TenantStatus;
  contractDate: string;
  lastPaymentAt: string | null;
  nextInvoiceDueAt: string | null;
  blockedAt: string | null;
  cancelledAt: string | null;
  history: {
    invoices: number;
    paid: number;
    overdue: number;
    open: number;
    paidCents: number;
    overdueCents: number;
    openCents: number;
  };
}

export interface PayableResult {
  rows: PayableSubscriptionRow[];
  byStatus: Array<{ status: TenantStatus; count: number }>;
  totals: { paidCents: number; overdueCents: number; openCents: number; invoices: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoRange(from?: string, to?: string): { from?: Date; to?: Date } {
  const fromDate = from && !Number.isNaN(Date.parse(from)) ? new Date(from) : undefined;
  const toDate =
    to && !Number.isNaN(Date.parse(to)) ? new Date(new Date(to).getTime() + DAY_MS) : undefined;
  return { from: fromDate, to: toDate };
}

export async function getPayableSubscriptions(
  filters: PayableFilters = {},
): Promise<PayableResult> {
  const { from, to } = isoRange(filters.from, filters.to);
  const search = filters.search?.trim();

  const tenants = await prismaUnscoped.tenant.findMany({
    where: {
      AND: [
        search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } },
              ],
            }
          : {},
        filters.planCode ? { plan: { is: { code: filters.planCode } } } : {},
        filters.status ? { subscription: { is: { status: filters.status as TenantStatus } } } : {},
        from || to
          ? {
              OR: [
                { createdAt: { gte: from ?? undefined, lte: to ?? undefined } },
                { subscription: { is: { lastPaymentAt: { gte: from ?? undefined, lte: to ?? undefined } } } },
              ],
            }
          : {},
      ],
    },
    include: {
      plan: { select: { name: true } },
      subscription: {
        select: {
          status: true,
          priceCents: true,
          billingCycle: true,
          createdAt: true,
          lastPaymentAt: true,
          nextInvoiceDueAt: true,
          blockedAt: true,
          cancelledAt: true,
          plan: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const ids = tenants.map((t) => t.id);

  // Invoice history summary per tenant+status.
  const grouped = ids.length
    ? await prismaUnscoped.paymentInvoice.groupBy({
        by: ["tenantId", "status"],
        _count: { _all: true },
        _sum: { amountCents: true },
        where: { tenantId: { in: ids } },
      })
    : [];

  const rows: PayableSubscriptionRow[] = tenants.map((t) => {
    const sub = t.subscription;
    const stats = grouped.filter((g) => g.tenantId === t.id);
    const countFor = (s: PaymentInvoiceStatus[]) =>
      stats.filter((g) => s.includes(g.status as PaymentInvoiceStatus)).reduce((n, g) => n + g._count._all, 0);
    const sumFor = (s: PaymentInvoiceStatus[]) =>
      stats.filter((g) => s.includes(g.status as PaymentInvoiceStatus)).reduce((n, g) => n + (g._sum.amountCents ?? 0), 0);
    const paidCents = sumFor(["PAID"]);
    const overdueCents = sumFor(["OVERDUE"]);
    const openCents = sumFor(["OPEN"]);
    const contractDate = sub?.createdAt ?? t.createdAt;
    return {
      tenantId: t.id,
      name: t.name,
      slug: t.slug,
      type: t.type,
      planName: sub?.plan?.name ?? t.plan?.name ?? null,
      priceCents: sub?.priceCents ?? 0,
      billingCycle: sub?.billingCycle ?? "MONTHLY",
      status: sub?.status ?? t.status,
      contractDate: contractDate.toISOString(),
      lastPaymentAt: sub?.lastPaymentAt?.toISOString() ?? null,
      nextInvoiceDueAt: sub?.nextInvoiceDueAt?.toISOString() ?? null,
      blockedAt: sub?.blockedAt?.toISOString() ?? null,
      cancelledAt: sub?.cancelledAt?.toISOString() ?? null,
      history: {
        invoices: countFor(["OPEN", "OVERDUE", "PAID"]),
        paid: countFor(["PAID"]),
        overdue: countFor(["OVERDUE"]),
        open: countFor(["OPEN"]),
        paidCents,
        overdueCents,
        openCents,
      },
    };
  });

  const byStatusMap = new Map<TenantStatus, number>();
  for (const r of rows) byStatusMap.set(r.status, (byStatusMap.get(r.status) ?? 0) + 1);

  return {
    rows,
    byStatus: [...byStatusMap.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    totals: {
      paidCents: rows.reduce((n, r) => n + r.history.paidCents, 0),
      overdueCents: rows.reduce((n, r) => n + r.history.overdueCents, 0),
      openCents: rows.reduce((n, r) => n + r.history.openCents, 0),
      invoices: rows.reduce((n, r) => n + r.history.invoices, 0),
    },
  };
}

/** Serialize payable rows to CSV (pt-BR, semicolon-separated, UTF-8 with BOM). */
export function subscriptionsToCsv(rows: PayableSubscriptionRow[]): string {
  const header = [
    "Cliente",
    "Slug",
    "Tipo",
    "Plano",
    "Valor (R$)",
    "Ciclo",
    "Status",
    "Contratacao",
    "Ultimo pagamento",
    "Proximo vencimento",
    "Bloqueio",
    "Cancelamento",
    "Faturas",
    "Aprovadas",
    "Vencidas",
    "Em aberto",
    "Aprovado (R$)",
    "Vencido (R$)",
    "Em aberto (R$)",
  ];
  const esc = (v: string | number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.name,
        r.slug,
        r.type,
        r.planName,
        (r.priceCents / 100).toFixed(2).replace(".", ","),
        r.billingCycle,
        r.status,
        dateCSV(r.contractDate),
        dateCSV(r.lastPaymentAt),
        dateCSV(r.nextInvoiceDueAt),
        dateCSV(r.blockedAt),
        dateCSV(r.cancelledAt),
        r.history.invoices,
        r.history.paid,
        r.history.overdue,
        r.history.open,
        (r.history.paidCents / 100).toFixed(2).replace(".", ","),
        (r.history.overdueCents / 100).toFixed(2).replace(".", ","),
        (r.history.openCents / 100).toFixed(2).replace(".", ","),
      ]
        .map(esc)
        .join(";"),
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

function dateCSV(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Distinct plan codes for the plan filter (kept in sync with the catalog). */
export async function payablesPlanOptions(): Promise<Array<{ code: string; name: string }>> {
  const plans = await prismaUnscoped.plan.findMany({
    select: { code: true, name: true },
    orderBy: { name: "asc" },
  });
  return plans;
}
