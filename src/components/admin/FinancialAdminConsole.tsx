"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";

/**
 * Master Admin — Gestão financeira das assinaturas (Checklist Item 17).
 *
 * Visão operacional completa (não contábil) de cada assinatura: cliente, plano,
 * valor, status, contratação, último pagamento, próximo vencimento, histórico
 * (aprovadas/vencidas/em aberto), bloqueios e cancelamentos — com filtros
 * (status, plano, busca, período) e exportação em CSV.
 */

interface FinRow {
  tenantId: string;
  name: string;
  slug: string;
  type: string;
  planName: string | null;
  priceCents: number;
  billingCycle: string;
  status: string;
  contractDate: string;
  lastPaymentAt: string | null;
  nextInvoiceDueAt: string | null;
  blockedAt: string | null;
  cancelledAt: string | null;
  history: {
    invoices: number;
    paid: number;
    overdue: number;
    open: number;
    paidCents: number;
    overdueCents: number;
    openCents: number;
  };
}

interface FinData {
  rows: FinRow[];
  byStatus: Array<{ status: string; count: number }>;
  totals: { paidCents: number; overdueCents: number; openCents: number; invoices: number };
  plans: Array<{ code: string; name: string }>;
}

const STATUS_OPTIONS = ["", "ACTIVE", "TRIAL", "PENDING_DUE", "PAST_DUE", "BLOCKED", "CANCELLED"] as const;

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function date(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export default function FinancialAdminConsole({ user }: { user: { name: string; email: string; role: UserRole } }) {
  const [data, setData] = useState<FinData | null>(null);
  const [status, setStatus] = useState<string>("");
  const [plan, setPlan] = useState<string>("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (plan) params.set("plan", plan);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
      if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
      const res = await fetch(`/api/admin/financial/tenants?${params.toString()}`);
      const body = (await res.json()) as FinData & { error?: string; message?: string };
      if (!res.ok || body.error) throw new Error(body.message ?? body.error ?? "Falha ao carregar.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setBusy(false);
    }
  }, [status, plan, q, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (plan) params.set("plan", plan);
    if (q.trim()) params.set("q", q.trim());
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(`${to}T23:59:59`).toISOString());
    return `/api/admin/financial/export?${params.toString()}`;
  }, [status, plan, q, from, to]);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Gestão financeira</h1>
          <p className="muted">{user.name} · Plataforma (MASTER) · Filtros + exportação</p>
        </div>
        <div className="row">
          <a className="secondary" href={exportUrl()} download>
            Exportar CSV
          </a>
          <button className="secondary" onClick={() => void load()} disabled={busy}>
            Atualizar
          </button>
        </div>
      </div>

      {error && <div className="card error">{error}</div>}

      <div className="card">
        <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem", alignItems: "end" }}>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {STATUS_OPTIONS.slice(1).map((s) => (
                <option key={s} value={s}>
                  {s === "ACTIVE" ? "Ativo" : s === "TRIAL" ? "Trial" : s === "PENDING_DUE" ? "Pendente" : s === "PAST_DUE" ? "Em atraso" : s === "BLOCKED" ? "Bloqueado" : "Cancelado"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Plano
            <select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">Todos</option>
              {(data?.plans ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Buscar
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome ou slug" />
          </label>
          <label>
            De
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Até
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button onClick={() => void load()} disabled={busy}>
            Aplicar
          </button>
        </div>

        {data && (
          <div className="row" style={{ marginTop: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <span className="badge status-ok">Aprovado {brl(data.totals.paidCents)}</span>
            <span className="badge status-warn">Vencido {brl(data.totals.overdueCents)}</span>
            <span className="badge status-warn">Em aberto {brl(data.totals.openCents)}</span>
            <span className="badge">{data.totals.invoices} faturas</span>
            {data.byStatus.map((s) => (
              <span key={s.status} className={`badge ${s.status === "ACTIVE" ? "status-ok" : s.status === "PAST_DUE" || s.status === "BLOCKED" ? "status-bad" : ""}`}>
                {s.status}: {s.count}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Plano</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Contratação</th>
                <th>Últ. pagamento</th>
                <th>Próx. vencimento</th>
                <th>Histórico (Apr/Ven/Abert)</th>
                <th>Bloqueio / Cancel.</th>
              </tr>
            </thead>
            <tbody>
              {busy && !data ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center" }}>Carregando…</td>
                </tr>
              ) : (data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center" }}>Nenhuma assinatura com os filtros atuais.</td>
                </tr>
              ) : (
                (data?.rows ?? []).map((r) => (
                  <tr key={r.tenantId}>
                    <td>
                      {r.name} <span className="muted">({r.slug})</span>
                    </td>
                    <td>{r.planName ?? "—"}</td>
                    <td>
                      {brl(r.priceCents)} <span className="muted">/{r.billingCycle === "YEARLY" ? "ano" : "mês"}</span>
                    </td>
                    <td>
                      <span className={`badge ${statusClass(r.status)}`}>{r.status}</span>
                      {r.blockedAt && <span className="muted"> ({date(r.blockedAt)})</span>}
                    </td>
                    <td>{date(r.contractDate)}</td>
                    <td>{date(r.lastPaymentAt)}</td>
                    <td>{date(r.nextInvoiceDueAt)}</td>
                    <td>
                      {r.history.paid} / {r.history.overdue} / {r.history.open}
                    </td>
                    <td>
                      {r.blockedAt
                        ? `Bloqueado ${date(r.blockedAt)}`
                        : r.cancelledAt
                          ? `Cancelado ${date(r.cancelledAt)}`
                          : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Exibindo {data?.rows.length ?? 0} assinante(s). A exportação traz os mesmos filtros aplicados.
        </p>
      </div>
    </>
  );
}

function statusClass(s: string): string {
  switch (s) {
    case "ACTIVE":
      return "status-ok";
    case "TRIAL":
    case "PENDING_DUE":
    case "PAST_DUE":
      return "status-warn";
    case "BLOCKED":
    case "CANCELLED":
      return "status-bad";
    default:
      return "";
  }
}
