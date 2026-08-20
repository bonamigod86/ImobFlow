"use client";

import type { ReactNode } from "react";
import { Building2, Eye, Users, MousePointerClick, ArrowUpRight, ArrowDownRight, Minus, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardSnapshot, PropertyStatus, StatusCounts } from "@/components/dashboard/types";
import {
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  formatCount,
  usagePercent,
  usageTone,
  deltaPct,
} from "@/components/dashboard/format";
import { cn } from "@/lib/utils";

interface MetricsGridProps {
  snapshot: DashboardSnapshot | null;
  counts: StatusCounts;
}

export function MetricsGrid({ snapshot, counts }: MetricsGridProps) {
  if (!snapshot) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ActivePropertiesCard counts={counts} />
      <PlanQuotaCard utilization={snapshot.utilization} />
      <LeadPipelineCard snapshot={snapshot} />
      <ViewsCard snapshot={snapshot} />
    </div>
  );
}

function ActivePropertiesCard({ counts }: { counts: StatusCounts }) {
  const statuses: PropertyStatus[] = ["ACTIVE", "INACTIVE", "SOLD", "RENTED"];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-brand-400" />
          Imóveis ativos
        </CardTitle>
        <CardDescription>Estado atual do portfólio</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-ink-50">{formatCount(counts.ACTIVE)}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {statuses.map((status) => (
            <Badge key={status} variant={STATUS_BADGE_VARIANTS[status]}>
              {STATUS_LABELS[status]} · {formatCount(counts[status])}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PlanQuotaCard({ utilization }: { utilization: DashboardSnapshot["utilization"] }) {
  if (!utilization) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Utilização do plano</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-300">Plano não disponível no contexto atual.</p>
        </CardContent>
      </Card>
    );
  }
  const rows: Array<{
    label: string;
    used: number;
    max: number | null;
    icon: ReactNode;
  }> = [
    { label: "Imóveis", used: utilization.usedProperties, max: utilization.maxProperties, icon: <Building2 className="h-4 w-4 text-brand-400" /> },
    { label: "Usuários", used: utilization.usedUsers, max: utilization.maxUsers, icon: <Users className="h-4 w-4 text-sky-400" /> },
    { label: "Leads/mês", used: utilization.usedLeads, max: utilization.maxLeads, icon: <MousePointerClick className="h-4 w-4 text-emerald-400" /> },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GaugeDot />
          Utilização do plano
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          {utilization.planName}
          <Badge variant="secondary" className="font-mono uppercase">{utilization.planCode}</Badge>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row) => {
          const pct = usagePercent(row.used, row.max);
          const maxLabel = row.max === null ? "Ilimitado" : formatCount(row.max);
          return (
            <div key={row.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm text-ink-200">
                  {row.icon}
                  {row.label}
                </span>
                <span className="text-xs tabular-nums text-ink-300">
                  {formatCount(row.used)} de {maxLabel}
                  {pct !== null && <span className="ml-1 text-ink-400">({pct}%)</span>}
                </span>
              </div>
              {pct === null ? (
                <div className="h-2 rounded-full bg-ink-700" />
              ) : (
                <Progress value={pct} indicatorClassName={usageTone(pct)} />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function GaugeDot() {
  // Tiny radial glyph reused as the plan card accent.
  return (
    <span className="flex h-4 w-4 items-center justify-center rounded-full border border-brand-500/40 bg-brand-500/15">
      <Sparkles className="h-2.5 w-2.5 text-brand-300" />
    </span>
  );
}

function LeadPipelineCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const trend = deltaPct(snapshot.leads7d, snapshot.leads30d);
  const conv30 = Math.round(snapshot.conversion30d * 100);
  const conv7 = Math.round(snapshot.conversion7d * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MousePointerClick className="h-4 w-4 text-emerald-400" />
          Funil de leads
        </CardTitle>
        <CardDescription>Captura nos últimos 30 dias</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-ink-50">
            {formatCount(snapshot.leads30d)}
          </p>
          <DeltaBadge delta={trend.delta} pct={trend.pct} />
        </div>
        <p className="mt-1 text-sm text-ink-300">
          <span className="text-ink-100">{formatCount(snapshot.leads7d)}</span> nos últimos 7 dias
        </p>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-ink-700 bg-ink-950/40 px-3 py-2">
          <span className="text-xs text-ink-400">Conversão</span>
          <span className="flex items-center gap-2 text-sm tabular-nums">
            <span className="font-medium text-ink-100">{conv30}%</span>
            <span className="text-xs text-ink-400">7d: {conv7}%</span>
            <ConversionDot current={conv7} previous={conv30} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ViewsCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const trend = deltaPct(snapshot.views7d, snapshot.views30d);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-sky-400" />
          Visitas ao portal
        </CardTitle>
        <CardDescription>Visualizações de imóveis</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-ink-50">
            {formatCount(snapshot.views30d)}
          </p>
          <DeltaBadge delta={trend.delta} pct={trend.pct} />
        </div>
        <p className="mt-1 text-sm text-ink-300">
          <span className="text-ink-100">{formatCount(snapshot.views7d)}</span> nos últimos 7 dias
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-ink-400">
            <span>Ritmo semanal</span>
            <span className="tabular-nums">{formatCount(snapshot.views7d)} / 7d</span>
          </div>
          <Bars7vs30 current7d={snapshot.views7d} total30d={snapshot.views30d} />
        </div>
      </CardContent>
    </Card>
  );
}

/** Mini bar comparing the last 7d against the expected weekly share of the 30d total. */
function Bars7vs30({ current7d, total30d }: { current7d: number; total30d: number }) {
  const weeklyShare = Math.max(0, Math.round(total30d - current7d) / 3);
  const maxVal = Math.max(1, current7d, weeklyShare);
  return (
    <div className="mt-2 flex h-10 items-end gap-2">
      <div
        className="relative flex-1 rounded-t-md bg-brand-500/80"
        style={{ height: `${Math.max(4, (current7d / maxVal) * 100)}%` }}
        title={`Últimos 7 dias: ${current7d}`}
      />
      <div
        className="flex-1 rounded-t-md bg-ink-600"
        style={{ height: `${Math.max(4, (weeklyShare / maxVal) * 100)}%` }}
        title={`Média das 3 semanas anteriores: ${Math.round(weeklyShare)}`}
      />
    </div>
  );
}

function DeltaBadge({ delta, pct }: { delta: "up" | "down" | "flat" | "new" | null; pct: number | null }) {
  if (delta === null) return null;
  if (delta === "new") {
    return (
      <Badge variant="info">
        <Sparkles className="h-3 w-3" />
        novo
      </Badge>
    );
  }
  const Icon = delta === "up" ? ArrowUpRight : delta === "down" ? ArrowDownRight : Minus;
  return (
    <Badge variant={delta === "up" ? "success" : delta === "down" ? "danger" : "secondary"}>
      <Icon className="h-3 w-3" />
      {pct !== null ? `${pct > 0 ? "+" : ""}${pct}%` : "—"}
    </Badge>
  );
}

function ConversionDot({ current, previous }: { current: number; previous: number }) {
  const cls = cn(
    "inline-flex h-4 w-4 items-center justify-center rounded-full text-[0.6rem] font-bold",
    current > previous ? "bg-emerald-500/20 text-emerald-300" : current < previous ? "bg-red-500/20 text-red-300" : "bg-ink-700 text-ink-300",
  );
  const Icon = current > previous ? ArrowUpRight : current < previous ? ArrowDownRight : Minus;
  return (
    <span className={cls} title={current > previous ? "Acima do período anterior" : current < previous ? "Abaixo do período anterior" : "Estável"}>
      <Icon className="h-3 w-3" />
    </span>
  );
}