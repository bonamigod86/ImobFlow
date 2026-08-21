"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarCheck,
  Copy,
  Eye,
  EyeOff,
  Images,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertyThumb } from "@/components/dashboard/PropertyThumb";
import { PropertyDialogs, type PropertyAction } from "@/components/dashboard/PropertyDialogs";
import type { PropertyRow } from "@/components/dashboard/types";
import { CATEGORY_LABELS } from "@/lib/public/types";
import {
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  TARGET_LABELS,
  formatCount,
  locationForRow,
  priceForRow,
} from "@/components/dashboard/format";

interface LifecycleActions {
  duplicate(): Promise<void>;
  toggleActive(): Promise<void>;
  setStatus(status: "SOLD" | "RENTED"): Promise<void>;
  toggleFeatured(): Promise<void>;
}

interface PropertyManagerProps {
  rows: PropertyRow[];
  loading: boolean;
  total: number;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onChanged: () => void;
}

/**
 * Property portfolio as a responsive card grid (no horizontal scroll). Each
 * card shows the cover, location, price and status with an "Editar" action plus
 * a menu for the full lifecycle. Create/edit/media/delete run through the shared
 * PropertyDialogs.
 */
export function PropertyManager({
  rows,
  loading,
  total,
  canCreate,
  canUpdate,
  canDelete,
  onChanged,
}: PropertyManagerProps) {
  const [action, setAction] = useState<PropertyAction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [targetFilter, setTargetFilter] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((property) => {
      if (needle) {
        const hay = `${property.title} ${property.code}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (statusFilter && property.status !== statusFilter) return false;
      if (categoryFilter && property.category !== categoryFilter) return false;
      if (targetFilter && property.target !== targetFilter) return false;
      return true;
    });
  }, [rows, q, statusFilter, categoryFilter, targetFilter]);

  async function runLifecycle(property: PropertyRow, request: () => Promise<Response>, failMessage: string) {
    setActionError(null);
    setBusyId(property.id);
    try {
      const res = await request();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? failMessage);
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : failMessage);
    } finally {
      setBusyId(null);
    }
  }

  const lifecycle = (property: PropertyRow) => ({
    duplicate: () =>
      runLifecycle(property, () => fetch(`/api/properties/${property.id}/duplicate`, { method: "POST" }), "Falha ao duplicar o imóvel."),
    toggleActive: () =>
      runLifecycle(
        property,
        () =>
          fetch(`/api/properties/${property.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !property.isActive }),
          }),
        "Falha ao alterar a publicação.",
      ),
    setStatus: (status: "SOLD" | "RENTED") =>
      runLifecycle(
        property,
        () =>
          fetch(`/api/properties/${property.id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }),
        "Falha ao marcar o status.",
      ),
    toggleFeatured: () =>
      runLifecycle(
        property,
        () =>
          fetch(`/api/properties/${property.id}/featured`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ featured: !property.isFeatured }),
          }),
        "Falha ao alterar o destaque.",
      ),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Imóveis</h2>
          <p className="text-xs font-medium text-slate-500">
            {total > 0 ? `${formatCount(total)} ${total === 1 ? "imóvel cadastrado" : "imóveis cadastrados"}` : "Gestão do portfólio"}
          </p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setAction({ kind: "new" })}>
            <Plus className="h-4 w-4" />
            Novo imóvel
          </Button>
        )}
      </div>

      {actionError && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por título ou código…"
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Situação"
          className="h-10 shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
        >
          <option value="">Toda situação</option>
          {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={targetFilter}
          onChange={(e) => setTargetFilter(e.target.value)}
          aria-label="Tipo"
          className="h-10 shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
        >
          <option value="">Tipo (venda/aluguel)</option>
          <option value="SALE">À venda</option>
          <option value="RENT">Para alugar</option>
          <option value="BOTH">Venda e aluguel</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Categoria"
          className="h-10 shrink-0 whitespace-nowrap rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
        >
          <option value="">Toda categoria</option>
          {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 && !loading ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="text-sm text-slate-500">Nenhum imóvel cadastrado ainda.</p>
          {canCreate && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setAction({ kind: "new" })}>
              <Plus className="h-4 w-4" />
              Cadastrar primeiro imóvel
            </Button>
          )}
        </div>
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="text-sm text-slate-500">Nenhum imóvel corresponde aos filtros atuais.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((property) => {
            const price = priceForRow(property);
            const actions = lifecycle(property);
            const busy = busyId === property.id;
            return (
              <PropertyCard
                key={property.id}
                property={property}
                price={price}
                canUpdate={canUpdate}
                canDelete={canDelete}
                busy={busy}
                onAction={setAction}
                onLifecycle={actions}
              />
            );
          })}
        </div>
      )}

      <PropertyDialogs action={action} onClose={() => setAction(null)} onSaved={onChanged} />
    </div>
  );
}

function PropertyCard({
  property,
  price,
  canUpdate,
  canDelete,
  busy,
  onAction,
  onLifecycle,
}: {
  property: PropertyRow;
  price: ReturnType<typeof priceForRow>;
  canUpdate: boolean;
  canDelete: boolean;
  busy: boolean;
  onAction: (a: PropertyAction) => void;
  onLifecycle: LifecycleActions;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative aspect-[16/10] w-full bg-slate-100">
        <PropertyThumb
          url={property.coverImage}
          title={property.title}
          category={property.category}
          className="h-full w-full"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <Badge variant={STATUS_BADGE_VARIANTS[property.status]}>{STATUS_LABELS[property.status]}</Badge>
          {property.isFeatured && <Badge variant="neutral">Destaque</Badge>}
          {!property.isActive && <Badge variant="outline">Oculto</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate font-semibold text-slate-900" title={property.title}>
          {property.title}
        </h3>
        <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-slate-500">
          <MapPin className="h-3.5 w-3.5" />
          <span className="truncate">{locationForRow(property) || "Sem localização"}</span>
        </p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div>
            <span className="text-base font-extrabold text-slate-900 tabular-nums">
              {price.label}
            </span>
            {price.period && <span className="ml-0.5 text-xs font-medium text-slate-500">{price.period}</span>}
          </div>
          <Badge variant="secondary">{TARGET_LABELS[property.target]}</Badge>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
          {canUpdate && (
            <Button size="sm" variant="secondary" className="whitespace-nowrap" onClick={() => onAction({ kind: "edit", property })}>
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          )}
          <span className="font-mono text-[0.7rem] text-slate-400">{property.code}</span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" className="ml-auto" aria-label="Mais ações" title="Mais ações" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" strokeWidth={3} />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onAction({ kind: "view", property })}>
                <Eye />
                Ver detalhes
              </DropdownMenuItem>
              {canUpdate && (
                <>
                  <DropdownMenuItem onSelect={() => void onLifecycle.duplicate()}>
                    <Copy />
                    Duplicar
                  </DropdownMenuItem>
                  {property.isFeatured ? (
                    <DropdownMenuItem onSelect={() => void onLifecycle.toggleFeatured()}>
                      <StarOff />
                      Remover destaque
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => void onLifecycle.toggleFeatured()}>
                      <Star />
                      Destacar
                    </DropdownMenuItem>
                  )}
                  {property.isActive ? (
                    <DropdownMenuItem onSelect={() => void onLifecycle.toggleActive()}>
                      <EyeOff />
                      Desativar (ocultar)
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => void onLifecycle.toggleActive()}>
                      <Eye />
                      Ativar (publicar)
                    </DropdownMenuItem>
                  )}
                  {property.status !== "SOLD" && (
                    <DropdownMenuItem onSelect={() => void onLifecycle.setStatus("SOLD")}>
                      <BadgeCheck />
                      Marcar vendido
                    </DropdownMenuItem>
                  )}
                  {property.status !== "RENTED" && (
                    <DropdownMenuItem onSelect={() => void onLifecycle.setStatus("RENTED")}>
                      <CalendarCheck />
                      Marcar alugado
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={() => onAction({ kind: "media", property })}>
                    <Images />
                    Fotos e vídeos
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600 focus:bg-red-50 focus:text-red-700" onSelect={() => onAction({ kind: "delete", property })}>
                    <Trash2 />
                    Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export type { LifecycleActions };
