import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCentsBRL } from "@/lib/money";
import { STATUS_LABELS, type FinanceMetrics, type PlatformInsights } from "./types";
import { AdminCardHeader } from "./KpiCards";
import { BarChart3, Home, Users, HandCoins } from "lucide-react";

/**
 * Checklist Item 16 — platform-wide KPI aggregation widget.
 * Renders clients / properties / leads / finance grouped metric cards.
 */

function fmt(pct: number | null): string {
  if (pct === null) return "—";
  return `${(pct * 100).toFixed(1).replace(".", ",")}%`;
}

export function PlatformMetrics({ insights, finance }: { insights: PlatformInsights; finance: FinanceMetrics }) {
  const c = insights.clients;
  const p = insights.properties;
  const l = insights.leads;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {/* Clientes */}
      <Card>
        <AdminCardHeader
          title="Clientes"
          description="Imobiliárias e corretores por situação."
          icon={<Users className="h-4 w-4 text-brand-400" />}
        />
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <MetricValue label="Total" value={c.total} />
            <MetricValue label="Imobiliárias" value={c.agencies} />
            <MetricValue label="Corretores" value={c.brokers} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Row label="Ativos/pagantes" value={c.paid} accent="emerald" />
            <Row label="Trials" value={c.trial} />
            <Row label="Pendentes" value={c.pendingDue} accent="amber" />
            <Row label="Em atraso" value={c.pastDue} accent="amber" />
            <Row label="Bloqueados" value={c.blocked} accent="red" />
            <Row label="Cancelados" value={c.cancelled} accent="red" />
            <Row label={`Novos (período)`} value={c.newThisPeriod} accent="emerald" />
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {c.byStatus.map((s) => (
              <Badge key={s.status} variant="info">
                {STATUS_LABELS[s.status as keyof typeof STATUS_LABELS] ?? s.status}: {s.count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Imóveis */}
      <Card>
        <AdminCardHeader
          title="Imóveis"
          description="Inventário e destaques da plataforma."
          icon={<Home className="h-4 w-4 text-sky-400" />}
        />
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <MetricValue label="Total" value={p.total} />
            <MetricValue label="Ativos" value={p.active} />
            <MetricValue label="Novos (período)" value={p.newThisPeriod} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Row label="Vendidos" value={p.sold} />
            <Row label="Alugados" value={p.rented} />
            <Row label="Inativos" value={p.inactive} />
            <Row label="Em destaque" value={p.highlighted} accent="sky" />
          </div>
        </CardContent>
      </Card>

      {/* Leads */}
      <Card>
        <AdminCardHeader
          title="Leads"
          description="Aquisição, financiamento, encaminhamento e conversão."
          icon={<BarChart3 className="h-4 w-4 text-emerald-400" />}
        />
        <CardContent>
          <div className="grid grid-cols-3 gap-3 text-center">
            <MetricValue label="Total" value={l.total} />
            <MetricValue label={`No período (${l.inPeriod})`} value={l.realEstate} accent="emerald" />
            <MetricValue label="Financeiros" value={l.financial} accent="sky" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Row label="Encaminhados a sistemas externos" value={l.forwarded} accent="emerald" />
            <Row label="Qualificados/vendidos" value={l.qualified} />
            <Row label="Taxa de qualificação" value={fmt(l.conversion.qualifiedRate)} />
            <Row label="Taxa de financeiros" value={fmt(l.conversion.financialRate)} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="mb-1 font-medium text-ink-300">Top cidades</p>
              {l.byCity.length === 0 ? (
                <p className="text-ink-500">sem dados</p>
              ) : (
                <ul className="space-y-1">
                  {l.byCity.map((b) => (
                    <li key={b.city} className="flex justify-between text-ink-200">
                      <span>{b.city}</span>
                      <span>{b.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-1 font-medium text-ink-300">Top imobiliárias</p>
              {l.byAgency.length === 0 ? (
                <p className="text-ink-500">sem dados</p>
              ) : (
                <ul className="space-y-1">
                  {l.byAgency.map((b) => (
                    <li key={b.tenantId} className="flex justify-between text-ink-200">
                      <span className="truncate pr-2">{b.tenantName}</span>
                      <span>{b.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Financeiro */}
      <Card>
        <AdminCardHeader
          title="Financeiro"
          description="MRR, receita, recebidos, pendentes e inadimplência."
          icon={<HandCoins className="h-4 w-4 text-amber-400" />}
        />
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-center">
            <MetricValue label="MRR" value={formatCentsBRL(finance.mrrCents)} />
            <MetricValue label="Receita (período)" value={formatCentsBRL(finance.periodRevenueCents)} accent="emerald" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <Row label="Pagamentos recebidos" value={formatCentsBRL(finance.periodRevenueCents)} accent="emerald" />
            <Row label="Pendentes a receber" value={formatCentsBRL(finance.pendingRevenueCents)} accent="amber" />
            <Row label="Inadimplência (contas)" value={finance.pastDueCount} accent="amber" />
            <Row label="Inadimplência (valor)" value={formatCentsBRL(finance.pastDueAmountCents)} accent="amber" />
            <Row label="Bloqueadas" value={finance.blockedCount} accent="red" />
            <Row label="Cancelamentos (período)" value={finance.churnedSubscriptions} accent="red" />
          </div>

          <p className="mb-1 mt-4 font-medium text-ink-300">Planos mais contratados</p>
          <ul className="space-y-1 text-xs">
            {finance.revenueByPlan.length === 0 ? (
              <li className="text-ink-500">sem dados</li>
            ) : (
              finance.revenueByPlan.map((plan) => (
                <li key={plan.planCode} className="flex justify-between text-ink-200">
                  <span>{plan.planName} · {plan.activeSubscriptions} assinante(s)</span>
                  <span>{formatCentsBRL(plan.mrrCents)}/mês</span>
                </li>
              ))
            )}
          </ul>
          <p className="mt-3 text-xs text-ink-400">
            Churn no período: {fmt(finance.churnRate)} · Consulte também o{" "}
            <a href="/admin/billing" className="font-medium text-brand-400 underline underline-offset-2">
              Console de billing
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricValue({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  const tone =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "amber"
        ? "text-amber-300"
        : accent === "red"
          ? "text-red-300"
          : accent === "sky"
            ? "text-sky-300"
            : "text-ink-50";
  return (
    <div>
      <p className={`text-xl font-semibold tracking-tight ${tone}`}>{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-ink-400">{label}</p>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-ink-800 px-3 py-2">
      <span className="text-ink-300">{label}</span>
      <span className="font-medium text-ink-50">{value}</span>
    </div>
  );
}
