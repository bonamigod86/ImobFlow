import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendArrow } from "./shared";
import { formatCentsBRL } from "@/lib/money";
import { ChartColumn, Users, Target, TriangleAlert } from "lucide-react";

interface KpiCardsProps {
  mrrCents: number;
  mrrTrendPct: number | null;
  activeTenants: number;
  paidTenants: number;
  pastDueTenants: number;
  totalTenants: number;
  leadsThisMonth: number;
}

export function KpiCards({
  mrrCents,
  mrrTrendPct,
  activeTenants,
  paidTenants,
  pastDueTenants,
  totalTenants,
  leadsThisMonth,
}: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-ink-300">
            MRR
          </CardTitle>
          <ChartColumn className="h-4 w-4 text-brand-400" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tracking-tight text-ink-50">
            {formatCentsBRL(mrrCents)}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-400">
            <TrendArrow pct={mrrTrendPct} />
            <span>vs mês anterior</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Assinantes ativos
          </CardTitle>
          <Users className="h-4 w-4 text-emerald-400" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tracking-tight text-ink-50">{activeTenants}</p>
          <p className="mt-1.5 text-xs text-ink-400">
            {paidTenants} pagantes · {pastDueTenants} em atraso · {totalTenants} contas
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Leads no mês
          </CardTitle>
          <Target className="h-4 w-4 text-sky-400" />
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tracking-tight text-ink-50">
            {leadsThisMonth.toLocaleString("pt-BR")}
          </p>
          <p className="mt-1.5 text-xs text-ink-400">capturados em toda a plataforma</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-ink-300">
            Inadimplência
          </CardTitle>
          <TriangleAlert className="h-4 w-4 text-amber-400" />
        </CardHeader>
        <CardContent>
          <p className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight text-ink-50">
            {pastDueTenants}
            <span className="text-sm font-normal text-ink-400">contas em atraso</span>
          </p>
          <p className="mt-1.5 text-xs text-ink-400">
            cobranças abertas abaixo no painel de cobrança
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminCardHeader({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: ReactNode;
}) {
  return (
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        {icon}
        {title}
      </CardTitle>
      <CardDescription>{description}</CardDescription>
    </CardHeader>
  );
}

export function StatusPill({
  tone,
  label,
}: {
  tone?: "up" | "down" | "warn" | "diagnostic";
  label: string;
}) {
  const map = {
    up: { dot: "bg-emerald-400", badge: "success" as const },
    warn: { dot: "bg-amber-400", badge: "warning" as const },
    down: { dot: "bg-red-500", badge: "danger" as const },
    diagnostic: { dot: "bg-sky-400", badge: "info" as const },
  };
  const toneSel = map[tone ?? "diagnostic"];
  return (
    <Badge variant={toneSel.badge}>
      <span className={`h-1.5 w-1.5 rounded-full ${toneSel.dot}`} />
      {label}
    </Badge>
  );
}