"use client";

import { useState } from "react";
import {
  BadgeCheck,
  CalendarCheck,
  Copy,
  Eye,
  EyeOff,
  Images,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PropertyThumb } from "@/components/dashboard/PropertyThumb";
import { PropertyDialogs, type PropertyAction } from "@/components/dashboard/PropertyDialogs";
import type { PropertyRow } from "@/components/dashboard/types";
import {
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  TARGET_LABELS,
  formatCount,
  locationForRow,
  priceForRow,
} from "@/components/dashboard/format";

interface PropertyManagerProps {
  rows: PropertyRow[];
  loading: boolean;
  total: number;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onChanged: () => void;
}

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
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Imóveis</CardTitle>
          <CardDescription>
            {total > 0 ? `${formatCount(total)} ${total === 1 ? "imóvel cadastrado" : "imóveis cadastrados"}` : "Gestão do portfólio"}
          </CardDescription>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setAction({ kind: "new" })}>
            <Plus className="h-4 w-4" />
            Novo imóvel
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {actionError && (
          <p className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {actionError}
          </p>
        )}
        {rows.length === 0 && !loading ? (
          <div className="rounded-lg border border-dashed border-ink-700 px-4 py-10 text-center">
            <p className="text-sm text-ink-300">Nenhum imóvel cadastrado ainda.</p>
            {canCreate && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setAction({ kind: "new" })}>
                <Plus className="h-4 w-4" />
                Cadastrar primeiro imóvel
              </Button>
            )}
          </div>
        ) : loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Imagem</TableHead>
                <TableHead>Código e título</TableHead>
                <TableHead className="hidden md:table-cell">Localização</TableHead>
                <TableHead className="hidden lg:table-cell">Finalidade</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((property) => {
                const price = priceForRow(property);
                const actions = lifecycle(property);
                const busy = busyId === property.id;
                return (
                  <TableRow key={property.id}>
                    <TableCell>
                      <PropertyThumb
                        url={property.coverImage}
                        title={property.title}
                        category={property.category}
                        className="h-10 w-14"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="max-w-[13rem] truncate text-sm font-medium text-ink-100">{property.title}</span>
                        <code className="font-mono text-xs text-ink-400">{property.code}</code>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="max-w-[11rem] truncate text-sm text-ink-300">{locationForRow(property)}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="secondary">{TARGET_LABELS[property.target]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="whitespace-nowrap text-sm tabular-nums text-ink-100">
                        {price.label}
                        {price.period && <span className="ml-0.5 text-xs text-ink-400">{price.period}</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANTS[property.status]}>
                        {STATUS_LABELS[property.status]}
                      </Badge>
                      {!property.isActive && (
                        <Badge variant="outline" className="ml-1.5">Oculto</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${property.title}`} disabled={busy}>
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setAction({ kind: "view", property })}>
                            <Eye />
                            Ver detalhes
                          </DropdownMenuItem>
                          {canUpdate && (
                            <>
                              <DropdownMenuItem onSelect={() => setAction({ kind: "edit", property })}>
                                <Pencil />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => void actions.duplicate()}>
                                <Copy />
                                Duplicar
                              </DropdownMenuItem>
                              {property.isFeatured ? (
                                <DropdownMenuItem onSelect={() => void actions.toggleFeatured()}>
                                  <StarOff />
                                  Remover destaque
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => void actions.toggleFeatured()}>
                                  <Star />
                                  Destacar
                                </DropdownMenuItem>
                              )}
                              {property.isActive ? (
                                <DropdownMenuItem onSelect={() => void actions.toggleActive()}>
                                  <EyeOff />
                                  Desativar (ocultar)
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => void actions.toggleActive()}>
                                  <Eye />
                                  Ativar (publicar)
                                </DropdownMenuItem>
                              )}
                              {property.status !== "SOLD" && (
                                <DropdownMenuItem onSelect={() => void actions.setStatus("SOLD")}>
                                  <BadgeCheck />
                                  Marcar vendido
                                </DropdownMenuItem>
                              )}
                              {property.status !== "RENTED" && (
                                <DropdownMenuItem onSelect={() => void actions.setStatus("RENTED")}>
                                  <CalendarCheck />
                                  Marcar alugado
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => setAction({ kind: "media", property })}>
                                <Images />
                                Fotos e vídeos
                              </DropdownMenuItem>
                            </>
                          )}
                          {canDelete && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-300 focus:bg-red-500/10 focus:text-red-200"
                                onSelect={() => setAction({ kind: "delete", property })}
                              >
                                <Trash2 />
                                Excluir
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <PropertyDialogs
        action={action}
        onClose={() => setAction(null)}
        onSaved={onChanged}
      />
    </Card>
  );
}