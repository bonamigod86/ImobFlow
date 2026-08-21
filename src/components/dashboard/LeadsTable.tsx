"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, ExternalLink, Landmark, MessageCircle, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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

/**
 * Leads received table (checklist sections 7 & 8). Tenant-scoped list with
 * WhatsApp CTA, solicitation + origin badges, expandable financial/LGPD detail
 * and a 4-stage pipeline status control. Used on `/dashboard/leads` (full) and
 * as a "Últimos Leads" preview on the executive dashboard (compact).
 */

interface LeadItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  type: string;
  origin: string;
  status: string;
  createdAt: string;
  payload: Record<string, unknown> | null;
  property: {
    id: string;
    code: string;
    title: string;
    salePrice: number | null;
    rentPrice: number | null;
  } | null;
  financeProfile: {
    propertyValue: string | number | null;
    downPayment: string | number | null;
    financingAmount: string | number | null;
    monthlyIncome: string | number | null;
    termMonths: number | null;
    city: string | null;
    state: string | null;
  } | null;
  consent: { textVersion: string; optedOut: boolean; grantedAt: string | null } | null;
}

const PIPELINE = [
  { label: "Novo", value: "NEW" },
  { label: "Em Atendimento", value: "CONTACTED" },
  { label: "Concluído", value: "WON" },
  { label: "Arquivado", value: "LOST" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  NEW: "Novo",
  CONTACTED: "Em atendimento",
  QUALIFIED: "Qualificado",
  PROPOSAL_SENT: "Proposta enviada",
  NEGOTIATION: "Negociando",
  WON: "Concluído",
  LOST: "Arquivado",
};

function waLink(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function solicitationType(lead: LeadItem): { label: string; variant: "success" | "info" | "warning" | "neutral" | "secondary" } {
  const payload = asRecord(lead.payload);
  const schedule = asRecord(payload?.schedule);
  if (schedule && (schedule.date || schedule.time)) return { label: "Agendamento de Visita", variant: "info" };
  if (lead.type === "FINANCIAL") return { label: "Simulação Financeira", variant: "success" };
  const message = typeof payload?.message === "string" ? payload.message.toLowerCase() : "";
  if (message.includes("dúvida") || message.includes("?")) {
    return { label: "Dúvida", variant: "secondary" };
  }
  return { label: "Contato Direto", variant: "warning" };
}

function originLabel(lead: LeadItem): string {
  const payload = asRecord(lead.payload);
  const utm = asRecord(payload?.utm);
  if (typeof utm?.source === "string" && utm.source.trim()) return utm.source.trim();
  const source = payload?.source;
  if (typeof source === "string") {
    const map: Record<string, string> = { portal: "Portal Orgânico", whatsapp: "WhatsApp", social: "Social" };
    return map[source] ?? source;
  }
  return lead.origin || "—";
}

function formatBRL(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function propertyPrice(lead: LeadItem): string {
  const p = lead.property;
  if (!p) return "—";
  if (p.rentPrice != null) return `R$ ${Number(p.rentPrice).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}/mês`;
  if (p.salePrice != null) return formatBRL(p.salePrice);
  return "—";
}

function dateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export default function LeadsTable({
  limit,
  showHeader = true,
}: {
  limit?: number;
  showHeader?: boolean;
}) {
  const [items, setItems] = useState<LeadItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<LeadItem | null>(null);
  const [q, setQ] = useState("");
  const [solicitation, setSolicitation] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const pageSize = limit ?? 50;
  const onlyFirstPage = limit !== undefined;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((lead) => {
      if (needle) {
        const hay = `${lead.name} ${lead.email ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (solicitation && solicitationType(lead).label !== solicitation) return false;
      if (statusFilter && lead.status !== statusFilter) return false;
      return true;
    });
  }, [items, q, solicitation, statusFilter]);

  const load = useCallback(
    async (pageNumber: number) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/leads?page=${pageNumber}&pageSize=${pageSize}`);
        const body = (await res.json().catch(() => ({}))) as { items?: LeadItem[]; pagination?: { total: number } };
        if (!res.ok || (body as { error?: string }).error) throw new Error("Falha ao carregar leads.");
        setItems(body.items ?? []);
        setTotal(body.pagination?.total ?? 0);
        setPage(pageNumber);
      } finally {
        setBusy(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  async function changeStatus(lead: LeadItem, status: string) {
    try {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      void load(page);
    } catch {
      /* ignore */
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900">Leads recebidos</h2>
            <p className="text-xs font-medium text-slate-500">
              {total} lead{total === 1 ? "" : "s"} · Dados isolados por tenant.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200/80 bg-white p-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="pl-9"
          />
        </div>
        <select
          value={solicitation}
          onChange={(e) => setSolicitation(e.target.value)}
          aria-label="Tipo de solicitação"
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
        >
          <option value="">Toda solicitação</option>
          <option>Agendamento de Visita</option>
          <option>Simulação Financeira</option>
          <option>Contato Direto</option>
          <option>Dúvida</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Situação"
          className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/60"
        >
          <option value="">Toda situação</option>
          <option value="NEW">Novo</option>
          <option value="CONTACTED">Em atendimento</option>
          <option value="WON">Concluído</option>
          <option value="LOST">Arquivado</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contato</TableHead>
              <TableHead>Imóvel de interesse</TableHead>
              <TableHead>Tipo de solicitação</TableHead>
              <TableHead>Origem / UTM</TableHead>
              <TableHead>Data / hora</TableHead>
              <TableHead className="text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {busy && filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-slate-400">
                  Carregando leads…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-slate-400">
                  Nenhum lead capturado ainda.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((lead) => (
                <LeadRow key={lead.id} lead={lead} onStatus={changeStatus} onDetail={() => setDetail(lead)} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!onlyFirstPage && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => void load(page - 1)}>
            Anterior
          </Button>
          <span className="text-xs text-ink-400">
            Página {page} de {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => void load(page + 1)}>
            Próxima
          </Button>
        </div>
      )}

      {detail && <LeadDetailDialog lead={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function LeadRow({
  lead,
  onStatus,
  onDetail,
}: {
  lead: LeadItem;
  onStatus: (lead: LeadItem, status: string) => void;
  onDetail: () => void;
}) {
  const wa = waLink(lead.phone);
  const solicitation = solicitationType(lead);

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="font-medium text-ink-50">{lead.name}</span>
            {lead.email && <span className="text-xs text-ink-400">{lead.email}</span>}
            {lead.phone && <span className="text-xs text-ink-400">{lead.phone}</span>}
          </div>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              title="Chamar no WhatsApp"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400 transition-colors hover:bg-emerald-500/25"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
        </div>
      </TableCell>

      <TableCell>
        <div className="flex max-w-[16rem] flex-col">
          <span className="truncate text-sm text-ink-100" title={lead.property?.title ?? undefined}>
            {lead.property?.title ?? "—"}
          </span>
          <span className="text-xs text-ink-400">
            {lead.property?.code ?? ""}
            {lead.property ? ` · ${propertyPrice(lead)}` : ""}
          </span>
        </div>
      </TableCell>

      <TableCell>
        <Badge variant={solicitation.variant}>{solicitation.label}</Badge>
      </TableCell>

      <TableCell>
        <Badge variant="neutral">{originLabel(lead)}</Badge>
      </TableCell>

      <TableCell>
        <span className="whitespace-nowrap text-sm text-ink-200">{dateTime(lead.createdAt)}</span>
      </TableCell>

      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              {STATUS_LABEL[lead.status] ?? lead.status}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[15rem]">
            <DropdownMenuLabel>{lead.name}</DropdownMenuLabel>
            {PIPELINE.map((s) => (
              <DropdownMenuItem key={s.value} onSelect={() => onStatus(lead, s.value)}>
                {s.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={onDetail}>
              Detalhes / Financiamento
              <ExternalLink className="ml-auto" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function LeadDetailDialog({ lead, onClose }: { lead: LeadItem; onClose: () => void }) {
  const payload = asRecord(lead.payload);
  const schedule = asRecord(payload?.schedule);
  const utm = asRecord(payload?.utm);
  const message = typeof payload?.message === "string" ? payload.message : null;
  const fp = lead.financeProfile;
  const solicitation = solicitationType(lead);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead.name}</DialogTitle>
          <DialogDescription>
            Capturado em {dateTime(lead.createdAt)}
            {lead.email ? ` · ${lead.email}` : ""}
            {lead.phone ? ` · ${lead.phone}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={solicitation.variant}>{solicitation.label}</Badge>
            <Badge variant="neutral">{originLabel(lead)}</Badge>
            <Badge variant={lead.status === "WON" ? "success" : "secondary"}>{STATUS_LABEL[lead.status] ?? lead.status}</Badge>
          </div>

          <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
            <p className="mb-1 font-medium text-ink-200">Imóvel de interesse</p>
            <p className="text-ink-100">
              {lead.property?.title ?? "—"}
              {lead.property ? ` · ${lead.property.code} · ${propertyPrice(lead)}` : ""}
            </p>
            {message && <p className="mt-2 text-xs text-ink-300">Mensagem: “{truncate(message, 220)}”</p>}
            {schedule && !!(schedule.date || schedule.time) && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-300">
                <CalendarClock className="h-3.5 w-3.5" />
                Visita: {String(schedule.date ?? "")} {String(schedule.time ?? "")}
              </p>
            )}
          </div>

          {fp && (
            <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-ink-200">
                <Landmark className="h-4 w-4" />
                Simulação financeira
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-ink-400">Renda mensal</dt>
                <dd className="text-right text-ink-100">{formatBRL(fp.monthlyIncome)}</dd>
                <dt className="text-ink-400">Entrada</dt>
                <dd className="text-right text-ink-100">{formatBRL(fp.downPayment)}</dd>
                <dt className="text-ink-400">Financiamento</dt>
                <dd className="text-right text-ink-100">{formatBRL(fp.financingAmount)}</dd>
                <dt className="text-ink-400">Prazo pretendido</dt>
                <dd className="text-right text-ink-100">{fp.termMonths ? `${fp.termMonths} meses` : "—"}</dd>
                <dt className="text-ink-400">Valor do imóvel</dt>
                <dd className="text-right text-ink-100">{formatBRL(fp.propertyValue)}</dd>
              </dl>
              {(fp.city || fp.state) && (
                <p className="mt-1 text-xs text-ink-400">
                  Local de interesse: {[fp.city, fp.state].filter(Boolean).join(" - ")}
                </p>
              )}
            </div>
          )}

          <div className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
            <p className="mb-1 flex items-center gap-1.5 font-medium text-ink-200">
              <ShieldCheck className="h-4 w-4" />
              Consentimento LGPD
            </p>
            {lead.consent ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-ink-400">Versão</dt>
                <dd className="text-right text-ink-100">{lead.consent.textVersion}</dd>
                <dt className="text-ink-400">Concedido em</dt>
                <dd className="text-right text-ink-100">{lead.consent.grantedAt ? dateTime(lead.consent.grantedAt) : "—"}</dd>
                <dt className="text-ink-400">Status</dt>
                <dd className="text-right">
                  {lead.consent.optedOut ? (
                    <Badge variant="warning">Retirado / anonimizado</Badge>
                  ) : (
                    <Badge variant="success">Ativo</Badge>
                  )}
                </dd>
              </div>
            ) : (
              <p className="text-xs text-ink-400">Sem registro de consentimento.</p>
            )}
          </div>

          {utm && Object.keys(utm).length > 0 && (
            <p className="text-xs text-ink-400">UTM: {JSON.stringify(utm)}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
