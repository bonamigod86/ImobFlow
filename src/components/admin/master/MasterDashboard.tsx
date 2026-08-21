"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { getJson } from "./api";
import { ActionDialog, type DialogAction } from "./ActionDialog";
import { KpiCards } from "./KpiCards";
import { PlatformMetrics } from "./PlatformMetrics";
import { HealthStrip } from "./HealthStrip";
import { TenantTable } from "./TenantTable";
import { DunningWidget } from "./DunningWidget";
import { SystemWidget } from "./SystemWidget";
import type { ControlData } from "./types";

interface MasterDashboardProps {
  user: { name: string; email: string; role: string };
}

export default function MasterDashboard({ user }: MasterDashboardProps) {
  const [control, setControl] = useState<ControlData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogAction | null>(null);
  const [tick, setTick] = useState(0);

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
  }, [refresh, tick]);

  function handleAction(action: DialogAction) {
    setDialog(action);
  }

  function handleDone(message: string) {
    setDialog(null);
    if (message.startsWith("/")) {
      window.location.href = message;
      return;
    }
    setNotice(message);
    void refresh();
    window.setTimeout(() => setNotice(null), 5000);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink-50">
              Painel executivo
            </h1>
            <Badge variant="neutral" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              {user.role}
            </Badge>
          </div>
          <p className="text-sm text-ink-400">
            {user.name} · {user.email}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </Button>
          <a href="/admin/billing">
            <Button variant="ghost" size="sm">
              <ExternalLink className="h-4 w-4" />
              Console de billing
            </Button>
          </a>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </p>
      ) : null}

      {control ? <HealthStrip health={control.health} queues={control.queues} /> : null}

      {control ? (
        <>
          <KpiCards
            mrrCents={control.kpi.mrrCents}
            mrrTrendPct={control.kpi.mrrTrendPct}
            activeTenants={control.kpi.activeTenants}
            paidTenants={control.kpi.paidTenants}
            pastDueTenants={control.kpi.pastDueTenants}
            totalTenants={control.tenants.length}
            leadsThisMonth={control.kpi.leadsThisMonth}
          />

          <PlatformMetrics insights={control.insights} finance={control.finance} />

          <TenantTable tenants={control.tenants} busy={busy} onAction={handleAction} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <DunningWidget rows={control.dunning} onAction={handleAction} />
            </div>
            <div className="xl:col-span-3">
              <SystemWidget queues={control.queues} audit={control.audit} busy={busy} />
            </div>
          </div>
        </>
      ) : busy ? (
        <div className="flex h-64 items-center justify-center text-sm text-ink-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Carregando painel executivo…
        </div>
      ) : null}

      <ActionDialog state={dialog} onClose={() => setDialog(null)} onDone={handleDone} />
    </div>
  );
}