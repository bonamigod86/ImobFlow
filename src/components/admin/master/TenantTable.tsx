import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { AdminCardHeader } from "./KpiCards";
import { dateBR } from "./shared";
import { formatCentsBRL } from "@/lib/money";
import {
  Building2,
  SearchCheck,
  MoreHorizontal,
  Eye,
  CreditCard,
  Scale,
  Lock,
  Unlock,
  Loader2,
} from "lucide-react";
import {
  STATUS_LABELS,
  STATUS_BADGE,
  type TenantRow,
  type TenantStatus,
} from "./types";
import type { DialogAction } from "./ActionDialog";

export type StatusFilter = "ALL" | TenantStatus;

interface TenantTableProps {
  tenants: TenantRow[];
  busy: boolean;
  onAction: (action: DialogAction) => void;
}

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "ACTIVE", label: "Ativos" },
  { value: "PAST_DUE", label: "Em atraso" },
  { value: "BLOCKED", label: "Bloqueados" },
  { value: "TRIAL", label: "Trial" },
];

export function TenantTable({ tenants, busy, onAction }: TenantTableProps) {
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const search = q.trim().toLowerCase();
    return tenants.filter((t) => {
      if (filter !== "ALL" && t.status !== filter) return false;
      if (!search) return true;
      return (
        t.name.toLowerCase().includes(search) ||
        t.slug.toLowerCase().includes(search) ||
        (t.ownerEmail ?? "").toLowerCase().includes(search)
      );
    });
  }, [tenants, filter, q]);

  return (
    <Card>
      <AdminCardHeader
        title="Assinantes da plataforma"
        description="Pesquise, filtre e gerencie cada tenant com ações administrativas."
        icon={<Building2 className="h-4 w-4 text-brand-400" />}
      />
      <CardContent>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <TabsList>
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value}>
                  {f.label}
                  {f.value !== "ALL" ? (
                    <span className="text-ink-500">
                      {tenants.filter((t) => t.status === f.value).length}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="relative lg:w-72">
            <SearchCheck className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, slug ou e-mail…"
              className="pl-8"
            />
          </div>
        </div>

        <div className="rounded-lg border border-ink-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agência</TableHead>
                <TableHead className="hidden md:table-cell">Contato do proprietário</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead className="hidden lg:table-cell">Assinado em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Em aberto</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {busy && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-ink-400">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Carregando assinantes…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-ink-400">
                    Nenhum assinante encontrado com os filtros atuais.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((t) => <TenantRowItem key={t.id} tenant={t} onAction={onAction} />)
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function TenantRowItem({
  tenant,
  onAction,
}: {
  tenant: TenantRow;
  onAction: (action: DialogAction) => void;
}) {
  const blocked = tenant.status === "BLOCKED" || tenant.manualBlockedAt !== null;
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-ink-700 bg-ink-800/60 font-semibold text-ink-200">
            {tenant.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-50">{tenant.name}</p>
            <p className="truncate text-xs text-ink-400">{tenant.slug}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <p className="text-sm text-ink-100">{tenant.ownerName ?? "—"}</p>
        <p className="text-xs text-ink-400">{tenant.ownerEmail ?? "Sem e-mail cadastrado"}</p>
      </TableCell>
      <TableCell>
        <Badge variant="info" className="capitalize">
          {tenant.planName ?? "—"}
        </Badge>
      </TableCell>
      <TableCell className="hidden text-sm text-ink-300 lg:table-cell">
        {dateBR(tenant.subscribedAt)}
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_BADGE[tenant.status]}>{STATUS_LABELS[tenant.status]}</Badge>
      </TableCell>
      <TableCell className="hidden text-sm sm:table-cell">
        {tenant.pendingCents > 0 ? (
          <span className="font-medium text-amber-300">
            {formatCentsBRL(tenant.pendingCents)}
          </span>
        ) : (
          <span className="text-ink-500">—</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Ações do tenant">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[13rem]">
            <DropdownMenuLabel>{tenant.slug}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction({ kind: "impersonate", tenant })}>
              <Eye className="h-4 w-4" />
              Entrar como assinante
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction({ kind: "plan", tenant })}>
              <Scale className="h-4 w-4" />
              Alterar plano / limites
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction({ kind: "payment", tenant })}>
              <CreditCard className="h-4 w-4" />
              Enviar link de pagamento
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {blocked ? (
              <DropdownMenuItem onSelect={() => onAction({ kind: "unblock", tenant })}>
                <Unlock className="h-4 w-4" />
                Desbloquear conta
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => onAction({ kind: "block", tenant })}>
                <Lock className="h-4 w-4" />
                Bloquear conta
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}