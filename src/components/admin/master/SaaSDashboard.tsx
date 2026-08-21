"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Building2,
  ExternalLink,
  HandCoins,
  Landmark,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  TrendingDown,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson } from "./api";
import { ActionDialog, type DialogAction } from "./ActionDialog";
import { TenantTable } from "./TenantTable";
import type { ControlData } from "./types";
import { formatCentsBRL } from "@/lib/money";

interface SaaSDashboardProps {
  user: { name: string; email: string; role: string };
}

function Stat({ icon: Icon, label, value, tone = "emerald" }: { icon: typeof Users; label: string; value: React.ReactNode; tone?: "emerald" | "amber" | "red" | "sky" | "violet" }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-700",
    red: "bg-red-100 text-red-700",
    sky: "bg-sky-100 text-sky-700",
    violet: "bg-violet-100 text-violet-700",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-xl font-extrabold tabular-nums tracking-tight text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Master Admin — Dashboard Global do SaaS. Same light identity as the tenant
 * dashboard. Defensive: every metric falls back to a safe default so the page
 * never renders empty. Sections: Financeiro, Planos, Clientes/Tenants e Ecossistema.
 */
export default function SaaSDashboard({ user }: SaaSDashboardProps) {
  const [control, setControl] = useState<ControlData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogAction | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await getJson<{ control: ControlData }>("/api/admin/control");
      setControl(data.control);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar o painel.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAction = (action: DialogAction) => setDialog(action);
  const handleDone = (message: string) => {
    setDialog(null);
    if (message.startsWith("/")) {
      window.location.href = message;
      return;
    }
    setNotice(message);
    void refresh();
    window.setTimeout(() => setNotice(null), 5000);
  };

  // Defensive defaults.
  const fin = control?.finance;
  const ten = control?.tenants ?? [];
  const c = control?.insights?.clients;
  const p = control?.insights?.properties;
  const l = control?.insights?.leads;
  const plans = fin?.revenueByPlan ?? [];

  const clientTotal = c?.total ?? ten.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard Global do SaaS</h1>
            <Badge variant="info" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              {user.role}
            </Badge>
          </div>
          <p className="text-xs font-medium text-slate-500">{user.name} · {user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
          <a href="/admin/billing">
            <Button variant="secondary" size="sm">
              <ExternalLink className="h-4 w-4" />
              Console de billing
            </Button>
          </a>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

      {!control && busy && (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando dashboard…
        </div>
      )}

      {control && (
        <>
          {/* 1 · Financeiro */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Financeiro</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat icon={HandCoins} label="MRR do mês" value={formatCentsBRL(fin?.mrrCents ?? 0)} tone="emerald" />
              <Stat icon={ShoppingBag} label="Pagamentos aprovados (período)" value={formatCentsBRL(fin?.periodRevenueCents ?? 0)} tone="sky" />
              <Stat icon={Landmark} label="Pendentes a receber" value={formatCentsBRL(fin?.pendingRevenueCents ?? 0)} tone="amber" />
              <Stat
                icon={TrendingDown}
                label="Inadimplência & churn"
                value={`${fin?.pastDueCount ?? 0} atraso · ${fin?.churnedSubscriptions ?? 0} cancel.`}
                tone="red"
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-slate-500">Valor em inadimplência</p>
                <p className="text-xl font-extrabold tabular-nums text-slate-900">{formatCentsBRL(fin?.pastDueAmountCents ?? 0)}</p>
                <p className="mt-1 text-xs text-slate-500">{fin?.blockedCount ?? 0} contas bloqueadas · churn {((fin?.churnRate ?? 0) * 100).toFixed(1)}%</p>
              </div>
              <PlansCard plans={plans} />
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-slate-500">Status das faturas</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  <li className="flex justify-between"><span className="text-slate-500">Aprovadas</span><span className="font-semibold tabular-nums text-slate-900">{formatCentsBRL(fin?.periodRevenueCents ?? 0)}</span></li>
                  <li className="flex justify-between"><span className="text-slate-500">Pendentes</span><span className="font-semibold tabular-nums text-slate-900">{formatCentsBRL(fin?.pendingRevenueCents ?? 0)}</span></li>
                  <li className="flex justify-between"><span className="text-slate-500">Vencidas</span><span className="font-semibold tabular-nums text-slate-900">{formatCentsBRL(fin?.pastDueAmountCents ?? 0)}</span></li>
                </ul>
              </div>
            </div>
          </section>

          {/* 2 · Clientes / Tenants */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Clientes / Tenants</h2>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge variant="success">Ativos: {c?.paid ?? 0}</Badge>
              <Badge variant="info">Trials: {c?.trial ?? 0}</Badge>
              <Badge variant="warning">Vencidos: {c?.pastDue ?? 0}</Badge>
              <Badge variant="danger">Bloqueados: {c?.blocked ?? 0}</Badge>
              <Badge variant="secondary">Cancelados: {c?.cancelled ?? 0}</Badge>
              <Badge variant="default">Total: {clientTotal}</Badge>
            </div>
            <TenantTable tenants={ten} busy={busy} onAction={handleAction} />
          </section>

          {/* 3 · Ecossistema */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Ecossistema</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat icon={Building2} label="Imóveis (total)" value={p?.total ?? 0} tone="violet" />
              <Stat icon={Building2} label="Ativos · Vendidos · Alugados" value={`${p?.active ?? 0} · ${p?.sold ?? 0} · ${p?.rented ?? 0}`} tone="violet" />
              <Stat icon={Users} label="Leads (imob · financeiro)" value={`${l?.realEstate ?? 0} · ${l?.financial ?? 0}`} tone="sky" />
              <Stat icon={Send} label="Encaminhados a externos" value={l?.forwarded ?? 0} tone="emerald" />
            </div>
          </section>
        </>
      )}

      <ActionDialog state={dialog} onClose={() => setDialog(null)} onDone={handleDone} />
    </div>
  );
}

function PlansCard({ plans }: { plans: Array<{ planCode: string; planName: string; mrrCents: number; activeSubscriptions: number }> }) {
  const max = Math.max(1, ...plans.map((p) => p.mrrCents));
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-medium text-slate-500">Planos mais contratados</p>
      {plans.length === 0 ? (
        <p className="text-sm text-slate-400">Sem dados de planos.</p>
      ) : (
        <ul className="space-y-2.5">
          {plans.map((p) => (
            <li key={p.planCode}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700">{p.planName} · {p.activeSubscriptions}</span>
                <span className="tabular-nums text-slate-900">{formatCentsBRL(p.mrrCents)}/mês</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(p.mrrCents / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
