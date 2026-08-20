"use client";

import { useState } from "react";
import { Eye, Pencil, Plus, MoreHorizontal, Trash2 } from "lucide-react";
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
  canDelete: boolean;
  onChanged: () => void;
}

export function PropertyManager({
  rows,
  loading,
  total,
  canCreate,
  canDelete,
  onChanged,
}: PropertyManagerProps) {
  const [action, setAction] = useState<PropertyAction | null>(null);

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
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-700 px-4 py-10 text-center">
            <p className="text-sm text-ink-300">Nenhum imóvel cadastrado ainda.</p>
            {canCreate && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setAction({ kind: "new" })}>
                <Plus className="h-4 w-4" />
                Cadastrar primeiro imóvel
              </Button>
            )}
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
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${property.title}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setAction({ kind: "view", property })}>
                            <Eye />
                            Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setAction({ kind: "edit", property })}>
                            <Pencil />
                            Editar
                          </DropdownMenuItem>
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