"use client";

import {
  Building2,
  Users,
  Eye,
  MessageCircle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  CalendarClock,
  BadgeCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardSnapshot, StatusCounts } from "@/components/dashboard/types";
import {
  TENANT_STATUS_LABELS,
  TENANT_STATUS_VARIANTS,
  formatCount,
  formatDate,
  usagePercent,
} from "@/components/dashboard/format";

interface MetricsGridProps {
  snapshot: DashboardSnapshot | null;
  counts: StatusCounts;
}

/**
 * Executive KPI grid — clean 4-column Light layout (Stripe/Linear style):
 * Imóveis ativos + quota · Leads do mês + conversão · Visitas & engajamento ·
 * Plano & assinatura.
 */
export function MetricsGrid({ snapshot, counts }: MetricsGridProps) {
  if (!snapshot) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <ActivePropertiesCard counts={counts} snapshot={snapshot} />
      <LeadsCard snapshot={snapshot} />
      <EngagementCard snapshot={snapshot} />
      <PlanCard snapshot={snapshot} />
    </div>
  );
}

// --- Card 1 · Imóveis ativos + quota ---------------------------------------
function ActivePropertiesCard({ counts, snapshot }: { counts: StatusCounts; snapshot: DashboardSnapshot }) {
  const util = snapshot.utilization;
  const pct = util ? usagePercent(util.usedProperties, util.maxProperties) : null;
  const maxLabel = util ? (util.maxProperties === null ? "Ilimitado" : formatCount(util.maxProperties)) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          Imóveis ativos
        </CardTitle>
        <CardDescription>Situação atual do portfólio</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">
          {formatCount(counts.ACTIVE)}
        </p>
        {util && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-xs font-medium text-slate-500">Uso da quota</span>
              <span className="tabular-nums text-slate-500">
                {formatCount(util.usedProperties)} de {maxLabel}
                {pct !== null ? ` · ${pct}%` : ""}
              </span>
            </div>
            {pct === null ? (
              <div className="h-2 rounded-full bg-slate-200" />
            ) : (
              <Progress value={pct} />
            )}
          </div>
        )}
        <Badge variant="success" className="mt-4">{formatCount(counts.ACTIVE)} ativos</Badge>
      </CardContent>
    </Card>
  );
}

// --- Card 2 · Leads do mês + conversão --------------------------------------
function LeadsCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const trend = deltaInfo(snapshot.leads7d, snapshot.leads30d);
  const conv = Math.round(snapshot.conversion30d * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-400" />
          Leads do mês
        </CardTitle>
        <CardDescription>Captura nos últimos 30 dias</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-3">
          <p className="text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {formatCount(snapshot.leads30d)}
          </p>
          <DeltaBadge delta={trend.delta} pct={trend.pct} />
        </div>
        <p className="mt-1 text-xs font-medium text-slate-500">
          {formatCount(snapshot.leads7d)} nos últimos 7 dias
        </p>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2">
          <span className="text-xs font-medium text-slate-500">Taxa de conversão</span>
          <span className="text-lg font-extrabold text-slate-900 tabular-nums">{conv}%</span>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Card 3 · Visitas & engajamento ------------------------------------------
function EngagementCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-slate-400" />
          Visitas & engajamento
        </CardTitle>
        <CardDescription>Últimos 30 dias</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Eye className="h-4 w-4" /> Visualizações de imóveis
          </span>
          <span className="text-xl font-extrabold text-slate-900 tabular-nums">{formatCount(snapshot.views30d)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <MessageCircle className="h-4 w-4" /> Cliques no WhatsApp
          </span>
          <span className="text-xl font-extrabold text-slate-900 tabular-nums">{formatCount(snapshot.whatsapp30d)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Card 4 · Plano & assinatura --------------------------------------------
function PlanCard({ snapshot }: { snapshot: DashboardSnapshot }) {
  const util = snapshot.utilization;
  const sub = snapshot.subscription;
  const planName = util?.planName ?? "—";
  const status = sub?.status ?? null;
  const nextDue = sub?.nextInvoiceDueAt || sub?.currentPeriodEnd || null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BadgeCheck className="h-4 w-4 text-slate-400" />
          Plano & assinatura
        </CardTitle>
        <CardDescription>Contrato vigente</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xl font-extrabold tracking-tight text-slate-900">{planName}</p>
          {status && (
            <Badge variant={status === "ACTIVE" ? "success" : TENANT_STATUS_VARIANTS[status]}>
              {TENANT_STATUS_LABELS[status]}
            </Badge>
          )}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <CalendarClock className="h-4 w-4" /> Próximo vencimento
          </span>
          <span className="text-sm font-semibold text-slate-900 tabular-nums">{nextDue ? formatDate(nextDue) : "—"}</span>
        </div>
        {sub?.trialEndsAt && sub.status === "TRIAL" && (
          <p className="mt-2 text-xs font-medium text-slate-500">Fim da avaliação: {formatDate(sub.trialEndsAt)}</p>
        )}
      </CardContent>
    </Card>
  );
}

function deltaInfo(current7d: number, total30d: number): { delta: "up" | "down" | "flat" | "new" | null; pct: number | null } {
  if (total30d <= 0) return { delta: current7d > 0 ? "new" : "flat", pct: null };
  const previous = Math.max(0, total30d - current7d) / 3;
  if (previous <= 0) return { delta: "new", pct: null };
  const pct = Math.round(((current7d - previous) / previous) * 100);
  if (pct > 0) return { delta: "up", pct };
  if (pct < 0) return { delta: "down", pct };
  return { delta: "flat", pct: 0 };
}

function DeltaBadge({ delta, pct }: { delta: "up" | "down" | "flat" | "new" | null; pct: number | null }) {
  if (!delta) return null;
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
