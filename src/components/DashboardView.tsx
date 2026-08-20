"use client";

import type { TenantStatus, UserRole } from "@prisma/client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useTenant } from "@/lib/tenant/tenant-client-context";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MetricsGrid } from "@/components/dashboard/MetricsGrid";
import { PropertyManager } from "@/components/dashboard/PropertyManager";
import { TopProperties } from "@/components/dashboard/TopProperties";
import { TopLeads } from "@/components/dashboard/TopLeads";
import { PlatformEmptyState } from "@/components/dashboard/PlatformEmptyState";
import type { DashboardSnapshot, PropertyRow, StatusCounts, TopPropertyView } from "@/components/dashboard/types";
import { priceForRow } from "@/components/dashboard/format";

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

/**
 * Tenant dashboard — executive layout. KPI cards, plan-quota progress,
 * lead/engagement windows, an editable property table and the top-3
 * engagements. Raw RBAC/JWT debug output lives behind the "developer
 * details" dialog only. Data is tenant-scoped via the API layer; the
 * platform view (MASTER, no tenant) renders an empty state instead.
 */
export default function DashboardView({ user, tenant, actions }: DashboardViewProps) {
  const { slug: clientSlug, role: clientRole } = useTenant();
  const [load, setLoad] = useState<LoadStatus>({ status: "loading" });

  const canCreate = actions.includes("properties:create");
  const canDelete = actions.includes("properties:delete");

  const refresh = useCallback(async () => {
    if (!tenant) return;
    setLoad((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    try {
      const [propsRes, snapRes] = await Promise.all([
        fetch("/api/properties?pageSize=100"),
        fetch("/api/analytics/dashboard"),
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
  }, [tenant]);

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

  const rowsById = useMemo(() => {
    const map = new Map<string, PropertyRow>();
    if (load.status === "ready") for (const row of load.rows) map.set(row.id, row);
    return map;
  }, [load]);

  const topProperties: TopPropertyView[] = useMemo(() => {
    if (load.status !== "ready" || !load.snapshot) return [];
    return load.snapshot.topProperties.slice(0, 3).map((item) => {
      const property = rowsById.get(item.id);
      return {
        id: item.id,
        code: item.code,
        title: item.title,
        views7d: item.views7d,
        leads7d: item.leads7d,
        leads30d: item.leads30d,
        conversionRate: item.conversionRate,
        slug: property?.slug ?? null,
        coverImage: property?.coverImage ?? null,
        category: property?.category ?? "OTHER",
        priceLabel: property ? priceForRow(property) : undefined,
      };
    });
  }, [load, rowsById]);

  const topByLeads: TopPropertyView[] = useMemo(() => {
    if (load.status !== "ready" || !load.snapshot) return [];
    return load.snapshot.topByLeads.slice(0, 5).map((item) => {
      const property = rowsById.get(item.id);
      return {
        id: item.id,
        code: item.code,
        title: item.title,
        views7d: item.views7d,
        leads7d: item.leads7d,
        leads30d: item.leads30d,
        conversionRate: item.conversionRate,
        slug: property?.slug ?? null,
        coverImage: property?.coverImage ?? null,
        category: property?.category ?? "OTHER",
        priceLabel: property ? priceForRow(property) : undefined,
      };
    });
  }, [load, rowsById]);

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
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-10 text-center">
          <AlertTriangle className="h-6 w-6 text-red-300" />
          <p className="max-w-md text-sm text-red-200">{load.message}</p>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <MetricsGrid snapshot={load.status === "ready" ? load.snapshot : null} counts={counts} />

          <div className="grid gap-6 lg:grid-cols-3">
            <PropertyManager
              rows={load.status === "ready" ? load.rows : []}
              total={load.status === "ready" ? load.total : 0}
              loading={load.status === "loading"}
              canCreate={canCreate}
              canDelete={canDelete}
              onChanged={() => void refresh()}
            />
            <div className="space-y-6">
              <TopProperties top={topProperties} loading={load.status === "loading"} />
              <TopLeads top={topByLeads} loading={load.status === "loading"} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}