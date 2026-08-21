"use client";

import type { TenantStatus, UserRole } from "@prisma/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { useTenant } from "@/lib/tenant/tenant-client-context";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MetricsGrid } from "@/components/dashboard/MetricsGrid";
import { PropertyManager } from "@/components/dashboard/PropertyManager";
import LeadsTable from "@/components/dashboard/LeadsTable";
import TeamUsersConsole from "@/components/dashboard/TeamUsersConsole";
import { TenantProfileForm } from "@/components/dashboard/TenantProfileForm";
import { PlatformEmptyState } from "@/components/dashboard/PlatformEmptyState";
import type { DashboardSnapshot, PropertyRow, StatusCounts } from "@/components/dashboard/types";

interface DashboardViewProps {
  user: { name: string; email: string; role: UserRole };
  tenant: { id: string; slug: string; name: string; status: TenantStatus } | null;
  actions: string[];
}

type LoadStatus =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: PropertyRow[]; total: number; snapshot: DashboardSnapshot | null };

interface PropertiesEnvelope {
  items?: PropertyRow[];
  pagination?: { total?: number };
  error?: string;
}

interface SnapshotEnvelope {
  snapshot?: DashboardSnapshot | null;
  error?: string;
}

type DashboardTab = "overview" | "properties" | "leads" | "team" | "profile";

/**
 * Tenant dashboard — tabbed workspace: Início (executive overview), Imóveis
 * (property cards), Leads (management table) and Perfil (self-service).
 */
export default function DashboardView({ user, tenant, actions }: DashboardViewProps) {
  const { slug: clientSlug, role: clientRole } = useTenant();
  const [load, setLoad] = useState<LoadStatus>({ status: "loading" });
  const [tab, setTab] = useState<DashboardTab>("overview");

  const canCreate = actions.includes("properties:create");
  const canUpdate = actions.includes("properties:update");
  const canDelete = actions.includes("properties:delete");
  const canManageUsers = actions.includes("users:read");
  const isAgent = user.role === "AGENT";

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setLoad((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    try {
      const [propsRes, snapRes] = await Promise.all([
        fetch("/api/properties?pageSize=100"),
        fetch(isAgent ? "/api/analytics/dashboard?assignedToMe=true" : "/api/analytics/dashboard"),
      ]);
      const propsBody = (await propsRes.json().catch(() => ({}))) as PropertiesEnvelope;
      const snapBody = (await snapRes.json().catch(() => ({}))) as SnapshotEnvelope;
      if (!propsRes.ok || propsBody.error) {
        throw new Error(propsBody.error ?? `Erro ${propsRes.status} ao carregar imóveis.`);
      }
      if (!snapRes.ok || snapBody.error) {
        throw new Error(snapBody.error ?? `Erro ${snapRes.status} ao carregar métricas.`);
      }
      setLoad({
        status: "ready",
        rows: propsBody.items ?? [],
        total: propsBody.pagination?.total ?? (propsBody.items?.length ?? 0),
        snapshot: snapBody.snapshot ?? null,
      });
    } catch (err) {
      setLoad({ status: "error", message: err instanceof Error ? err.message : "Falha ao carregar o painel." });
    }
  }, [tenant, isAgent]);

  useEffect(() => {
    if (tenant) void refresh();
  }, [tenant, refresh]);

  const counts: StatusCounts = useMemo(() => {
    const result: StatusCounts = { ACTIVE: 0, INACTIVE: 0, SOLD: 0, RENTED: 0 };
    if (load.status === "ready") {
      for (const row of load.rows) result[row.status] += 1;
    }
    return result;
  }, [load]);

  const planName = load.status === "ready" ? load.snapshot?.utilization?.planName ?? null : null;

  return (
    <div className="space-y-6">
      <DashboardHeader
        user={user}
        tenant={tenant}
        planName={planName}
        actions={actions}
        clientSlug={clientSlug}
        clientRole={clientRole}
      />

      {!tenant ? (
        <PlatformEmptyState />
      ) : load.status === "error" ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center">
          <AlertTriangle className="h-6 w-6 text-red-500" />
          <p className="max-w-md text-sm text-red-700">{load.message}</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as DashboardTab)}>
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Início</TabsTrigger>
            <TabsTrigger value="properties">Imóveis</TabsTrigger>
            <TabsTrigger value="leads">Leads</TabsTrigger>
            {canManageUsers && <TabsTrigger value="team">Equipe</TabsTrigger>}
            <TabsTrigger value="profile">Gerenciar perfil</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <WelcomeStrip
              name={user.name}
              planName={planName}
              onNewProperty={() => setTab("properties")}
            />
            <MetricsGrid snapshot={load.status === "ready" ? load.snapshot : null} counts={counts} />
          </TabsContent>

          <TabsContent value="properties">
            <PropertyManager
              rows={load.status === "ready" ? load.rows : []}
              total={load.status === "ready" ? load.total : 0}
              loading={load.status === "loading"}
              canCreate={canCreate}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onChanged={() => void refresh()}
            />
          </TabsContent>

          <TabsContent value="leads">
            <LeadsTable defaultMineOnly={isAgent} />
          </TabsContent>

          {canManageUsers && (
            <TabsContent value="team">
              <TeamUsersConsole />
            </TabsContent>
          )}

          <TabsContent value="profile">
            <TenantProfileForm />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function WelcomeStrip({
  name,
  planName,
  onNewProperty,
}: {
  name: string;
  planName: string | null;
  onNewProperty: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-slate-900 p-6 text-white shadow-md">
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-100/80">Painel do assinante</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Olá, {name.split(" ")[0]}</h2>
          <p className="mt-1 text-sm text-emerald-50/90">
            {planName ? `Plano ${planName}. ` : ""}Acompanhe seu portfólio, leads e métricas em um lugar só.
          </p>
        </div>
        <Button
          size="lg"
          className="bg-white text-emerald-700 shadow-sm hover:bg-emerald-50"
          onClick={onNewProperty}
        >
          <Plus className="h-4 w-4" />
          Novo imóvel
        </Button>
      </div>
    </div>
  );
}
