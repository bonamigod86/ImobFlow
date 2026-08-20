"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";

/**
 * Master Admin — SaaS billing console.
 *
 * Tabs:
 *   Visão geral   — financial snapshot (MRR, ARR, receita, churn, inadimplência)
 *                   + manual dunning scan trigger.
 *   Planos        — edit pricing/limits and toggle plans active/inactive.
 *   Assinantes    — tenant drill-down: subscription, invoices, notifications,
 *                   provisioning and a CUSTOM-gateway webhook simulator.
 *   Ledger        — the raw idempotency ledger of every ingested webhook.
 *
 * All data goes through MASTER-only API routes (`billing:admin`).
 */

interface Snapshot {
  mrrCents: number;
  arrCents: number;
  periodRevenueCents: number;
  pendingRevenueCents: number;
  pastDueCount: number;
  pastDueAmountCents: number;
  blockedCount: number;
  churnedSubscriptions: number;
  churnRate: number;
  activeHighlights: number;
  highlightCreditsSold: number;
  highlightRevenueCents: number;
  highlightBalancesCents: number;
  leadsDelivered: { realEstate: number; financial: number };
  propertiesTotal: number;
  propertiesActive: number;
  propertiesSold: number;
  revenueByPlan: Array<{ planCode: string; planName: string; mrrCents: number; activeSubscriptions: number }>;
  subscriptionsByStatus: Array<{ status: string; count: number }>;
  period: { from: string; to: string };
}

interface PlanRow {
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  billingCycle: "MONTHLY" | "YEARLY";
  maxProperties: number | null;
  maxUsers: number | null;
  maxLeads: number | null;
  highlightCredits: number;
  gracePeriodDays: number;
  trialDays: number;
  isActive: boolean;
}

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: { code: string; name: string } | null;
  subscription: {
    id: string;
    status: string;
    plan: { name: string; priceCents: number } | null;
    priceCents: number;
    billingCycle: string;
    currentPeriodEnd: string | null;
    nextInvoiceDueAt: string | null;
    graceEndsAt: string | null;
  } | null;
}

interface BillingDetail {
  tenant: { id: string; name: string; slug: string; status: string; manualBlockedAt: string | null; blockReason: string | null; plan: { code: string; name: string } | null; planOverride: boolean };
  subscription: {
    id: string;
    status: string;
    priceCents: number;
    billingCycle: string;
    provider: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    nextInvoiceDueAt: string | null;
    graceEndsAt: string | null;
    lastPaymentAt: string | null;
    cancelledAt: string | null;
    createdAt: string;
  } | null;
  invoices: Array<{ id: string; amountCents: number; status: string; dueDate: string; paidAt: string | null; attempts: number; createdAt: string }>;
  notifications: Array<{ id: string; kind: string; dueDate: string; createdAt: string }>;
  highlightBalance: number;
}

interface LedgerEvent {
  id: string;
  provider: string;
  providerEventId: string;
  type: string;
  status: string;
  tenantId: string | null;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "status-ok",
  TRIAL: "status-ok",
  PENDING_DUE: "status-warn",
  PAST_DUE: "status-warn",
  BLOCKED: "status-bad",
  CANCELLED: "status-bad",
};

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Render a nullable numeric plan field in an <input>. */
function limitValue(v: number | null): string {
  return v === null ? "" : String(v);
}

/** Parse an empty string back to null (unlimited). */
function parseLimit(v: string): number | null {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : Math.max(0, Math.trunc(n));
}

function date(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

export default function BillingAdminConsole({ user }: { user: { name: string; email: string; role: UserRole } }) {
  const [tab, setTab] = useState<"overview" | "plans" | "tenants" | "ledger">("overview");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BillingDetail | null>(null);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [provisionPlanCode, setProvisionPlanCode] = useState("");
  const [scanResult, setScanResult] = useState<{
    scan?: {
      preDueNotified: number;
      dueReminded: number;
      trialExpired: number;
      payableExpired: number;
      lateReminded: number;
      suspended: number;
      skippedSuspended: number;
    };
    renewal?: { opened: number; alreadyOpen: number; skippedFree: number };
    highlightsExpired?: number;
  } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newPlan, setNewPlan] = useState({
    code: "",
    name: "",
    priceCents: "0",
    billingCycle: "MONTHLY" as "MONTHLY" | "YEARLY",
    maxProperties: "",
    maxUsers: "",
    maxLeads: "",
    highlightCredits: "0",
  });

  async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(path);
    const data = (await res.json()) as T & { error?: string; message?: string };
    if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Falha na requisição.");
    return data;
  }

  async function postJson<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json()) as T & { error?: string; message?: string };
    if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Falha na requisição.");
    return data;
  }

  async function patchJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(path, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T & { error?: string; message?: string };
    if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Falha na requisição.");
    return data;
  }

  async function loadAll() {
    setBusy(true);
    setError(null);
    try {
      const [m, p, t] = await Promise.all([
        fetchJson<{ snapshot: Snapshot }>("/api/admin/billing/metrics?days=30"),
        fetchJson<{ plans: PlanRow[] }>("/api/admin/billing/plans"),
        fetchJson<{ tenants: TenantRow[] }>("/api/admin/tenants"),
      ]);
      setSnapshot(m.snapshot);
      setPlans(p.plans);
      setTenants(
        t.tenants.filter((x) => !statusFilter || x.status === statusFilter),
      );
      if (!provisionPlanCode && p.plans.length > 0) setProvisionPlanCode(p.plans[0]!.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (selectedTenantId) {
      fetchJson<BillingDetail>(`/api/admin/billing/tenants/${selectedTenantId}`)
        .then(setDetail)
        .catch((e) => setError(e.message));
    } else {
      setDetail(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTenantId]);

  useEffect(() => {
    if (tab === "ledger") {
      fetchJson<{ events: LedgerEvent[] }>("/api/admin/billing/events?limit=100")
        .then((d) => setEvents(d.events))
        .catch((e) => setError(e.message));
    }
  }, [tab]);

  async function runScan() {
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{
        scan: { preDueNotified: number; dueReminded: number; trialExpired: number; payableExpired: number; lateReminded: number; suspended: number; skippedSuspended: number };
        renewal: { opened: number; alreadyOpen: number; skippedFree: number };
        highlightsExpired: number;
      }>("/api/admin/billing/scan");
      setScanResult(res);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na varredura.");
    } finally {
      setBusy(false);
    }
  }

  async function savePlan(plan: PlanRow, data: Partial<PlanRow>) {
    setBusy(true);
    try {
      await patchJson(`/api/admin/billing/plans/${encodeURIComponent(plan.code)}`, data);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar plano.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePlan(plan: PlanRow) {
    setBusy(true);
    try {
      await postJson(`/api/admin/billing/plans/${encodeURIComponent(plan.code)}/status`, { isActive: !plan.isActive });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao alternar plano.");
    } finally {
      setBusy(false);
    }
  }

  async function createNewPlan() {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/admin/billing/plans", {
        code: newPlan.code.trim().toLowerCase(),
        name: newPlan.name.trim(),
        priceCents: Number(newPlan.priceCents) || 0,
        billingCycle: newPlan.billingCycle,
        maxProperties: parseLimit(newPlan.maxProperties),
        maxUsers: parseLimit(newPlan.maxUsers),
        maxLeads: parseLimit(newPlan.maxLeads),
        highlightCredits: Number(newPlan.highlightCredits) || 0,
      });
      setShowCreate(false);
      setNewPlan({ code: "", name: "", priceCents: "0", billingCycle: "MONTHLY", maxProperties: "", maxUsers: "", maxLeads: "", highlightCredits: "0" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar plano.");
    } finally {
      setBusy(false);
    }
  }

  async function provision() {
    if (!selectedTenantId || !provisionPlanCode) return;
    setBusy(true);
    try {
      await postJson(`/api/admin/billing/tenants/${selectedTenantId}/provision`, {
        planCode: provisionPlanCode,
        provider: "CUSTOM",
        force: true,
      });
      const d = await fetchJson<BillingDetail>(`/api/admin/billing/tenants/${selectedTenantId}`);
      setDetail(d);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao provisionar.");
    } finally {
      setBusy(false);
    }
  }

  async function simulate(type: string, overrides?: Record<string, unknown>) {
    if (!selectedTenantId) return;
    setBusy(true);
    try {
      await postJson(`/api/admin/billing/tenants/${selectedTenantId}/simulate`, { type, overrides });
      const d = await fetchJson<BillingDetail>(`/api/admin/billing/tenants/${selectedTenantId}`);
      setDetail(d);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Falha ao simular ${type}.`);
    } finally {
      setBusy(false);
    }
  }

  async function changeTenantStatus(status: string, reason?: string) {
    if (!selectedTenantId) return;
    setBusy(true);
    try {
      await patchJson(`/api/admin/tenants/${selectedTenantId}`, { status, reason });
      const d = await fetchJson<BillingDetail>(`/api/admin/billing/tenants/${selectedTenantId}`);
      setDetail(d);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao alterar situação.");
    } finally {
      setBusy(false);
    }
  }

  async function payOpenInvoice() {
    if (!selectedTenantId) return;
    setBusy(true);
    try {
      await postJson(`/api/admin/billing/tenants/${selectedTenantId}/pay`);
      const d = await fetchJson<BillingDetail>(`/api/admin/billing/tenants/${selectedTenantId}`);
      setDetail(d);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao baixar fatura.");
    } finally {
      setBusy(false);
    }
  }

  const s = snapshot;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Console de billing</h1>
          <p className="muted">
            {user.name} · Plataforma (MASTER)
          </p>
        </div>
        <button className="secondary" onClick={() => void loadAll()} disabled={busy}>
          Atualizar
        </button>
      </div>

      {error && <div className="card error">{error}</div>}

      <div className="row" style={{ marginBottom: "1rem" }}>
        {(["overview", "plans", "tenants", "ledger"] as const).map((t) => (
          <button key={t} className={tab === t ? "" : "secondary"} onClick={() => setTab(t)}>
            {t === "overview" ? "Visão geral" : t === "plans" ? "Planos" : t === "tenants" ? "Assinantes" : "Ledger"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2>Resultados SaaS</h2>
              <button onClick={() => void runScan()} disabled={busy}>
                Executar varredura de cobrança
              </button>
            </div>
            {scanResult && (
              <p className="muted" style={{ marginBottom: "0.5rem" }}>
                Varredura: {scanResult.scan?.preDueNotified ?? 0} pré-vencimento ·{" "}
                {scanResult.scan?.dueReminded ?? 0} avisos no vencimento ·{" "}
                {scanResult.scan?.trialExpired ?? 0} trials encerrados ·{" "}
                {scanResult.scan?.payableExpired ?? 0} faturas vencidas ·{" "}
                {scanResult.scan?.lateReminded ?? 0} lembretes em atraso ·{" "}
                {scanResult.scan?.suspended ?? 0} suspensões ·{" "}
                {scanResult.scan?.skippedSuspended ?? 0} suspensões puladas ·{" "}
                renovação: {scanResult.renewal?.opened ?? 0} faturas abertas ·{" "}
                {scanResult.highlightsExpired ?? 0} destaques expirados.
              </p>
            )}
            {s ? (
              <>
                <div className="row">
                  <span className="badge">MRR {brl(s.mrrCents)}</span>
                  <span className="badge">ARR {brl(s.arrCents)}</span>
                  <span className="badge">Receita no período {brl(s.periodRevenueCents)}</span>
                  <span className="badge status-warn">A receber {brl(s.pendingRevenueCents)}</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Métrica</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Inadimplência</td>
                      <td>
                        {s.pastDueCount} conta(s) · {brl(s.pastDueAmountCents)} · {s.blockedCount} bloqueada(s)
                      </td>
                    </tr>
                    <tr>
                      <td>Churn (período)</td>
                      <td>{s.churnedSubscriptions} cancelamentos · taxa {(s.churnRate * 100).toFixed(1)}%</td>
                    </tr>
                    <tr>
                      <td>Destaques ativos</td>
                      <td>{s.activeHighlights} imóveis</td>
                    </tr>
                    <tr>
                      <td>Créditos vendidos</td>
                      <td>
                        {s.highlightCreditsSold} · {brl(s.highlightRevenueCents)} · saldo em carteira {s.highlightBalancesCents}
                      </td>
                    </tr>
                    <tr>
                      <td>Leads entregues (CRM externo)</td>
                      <td>{s.leadsDelivered.realEstate} imobiliários · {s.leadsDelivered.financial} financeiros</td>
                    </tr>
                    <tr>
                      <td>Imóveis na plataforma</td>
                      <td>{s.propertiesTotal} total · {s.propertiesActive} ativos · {s.propertiesSold} vendidos</td>
                    </tr>
                  </tbody>
                </table>
                <h3 style={{ marginTop: "1rem" }}>MRR por plano</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Plano</th>
                      <th>Assinantes</th>
                      <th>MRR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.revenueByPlan.map((p) => (
                      <tr key={p.planCode}>
                        <td>{p.planName}</td>
                        <td>{p.activeSubscriptions}</td>
                        <td>{brl(p.mrrCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="muted">Carregando métricas…</p>
            )}
          </div>
        </>
      )}

      {tab === "plans" && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: "0.75rem" }}>
            <h2>Planos</h2>
            <button onClick={() => setShowCreate((v) => !v)} disabled={busy}>
              {showCreate ? "Cancelar" : "Novo plano"}
            </button>
          </div>

          {showCreate && (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Novo plano</h3>
              <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(13rem, 1fr))", gap: "0.5rem" }}>
                <label>
                  Código (imutável)
                  <input value={newPlan.code} onChange={(e) => setNewPlan((d) => ({ ...d, code: e.target.value }))} placeholder="ex: plus" />
                </label>
                <label>
                  Nome
                  <input value={newPlan.name} onChange={(e) => setNewPlan((d) => ({ ...d, name: e.target.value }))} placeholder="ex: Plus" />
                </label>
                <label>
                  Preço (centavos)
                  <input type="number" min={0} value={newPlan.priceCents} onChange={(e) => setNewPlan((d) => ({ ...d, priceCents: e.target.value }))} />
                </label>
                <label>
                  Ciclo
                  <select value={newPlan.billingCycle} onChange={(e) => setNewPlan((d) => ({ ...d, billingCycle: e.target.value as "MONTHLY" | "YEARLY" }))}>
                    <option value="MONTHLY">Mensal</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </label>
                <label>
                  Máx. imóveis (vazio = ilimitado)
                  <input type="number" min={0} value={newPlan.maxProperties} onChange={(e) => setNewPlan((d) => ({ ...d, maxProperties: e.target.value }))} />
                </label>
                <label>
                  Máx. usuários (vazio = ilimitado)
                  <input type="number" min={0} value={newPlan.maxUsers} onChange={(e) => setNewPlan((d) => ({ ...d, maxUsers: e.target.value }))} />
                </label>
                <label>
                  Máx. leads (vazio = ilimitado)
                  <input type="number" min={0} value={newPlan.maxLeads} onChange={(e) => setNewPlan((d) => ({ ...d, maxLeads: e.target.value }))} />
                </label>
                <label>
                  Créditos de destaque
                  <input type="number" min={0} value={newPlan.highlightCredits} onChange={(e) => setNewPlan((d) => ({ ...d, highlightCredits: e.target.value }))} />
                </label>
              </div>
              <div className="row" style={{ marginTop: "0.75rem" }}>
                <button onClick={() => void createNewPlan()} disabled={busy || !newPlan.code.trim() || !newPlan.name.trim()}>
                  Criar plano
                </button>
              </div>
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th>Plano</th>
                <th>Preço (centavos)</th>
                <th>Ciclo</th>
                <th>Limites</th>
                <th>Créditos destaque</th>
                <th>Carência (dias)</th>
                <th>Trial (dias)</th>
                <th>Ativo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <PlanEditor key={p.code} plan={p} onSave={savePlan} onToggle={togglePlan} busy={busy} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "tenants" && (
        <>
          <div className="card">
            <h2>Assinantes</h2>
            <label>Filtrar por situação</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos</option>
              <option value="TRIAL">Trial</option>
              <option value="ACTIVE">Ativo</option>
              <option value="PENDING_DUE">Pendente</option>
              <option value="PAST_DUE">Em atraso</option>
              <option value="BLOCKED">Bloqueado</option>
              <option value="CANCELLED">Cancelado</option>
            </select>
            <table>
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Situação</th>
                  <th>Plano</th>
                  <th>Próximo vencimento</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} style={{ background: selectedTenantId === t.id ? "rgba(99,102,241,0.12)" : undefined }}>
                    <td>
                      {t.name} <span className="muted">({t.slug})</span>
                    </td>
                    <td>
                      <span className={`badge ${STATUS_CLASS[t.subscription?.status ?? t.status] ?? ""}`}>
                        {t.subscription?.status ?? t.status}
                      </span>
                    </td>
                    <td>{t.subscription?.plan?.name ?? t.plan?.name ?? "—"}</td>
                    <td>{date(t.subscription?.nextInvoiceDueAt ?? null)}</td>
                    <td>
                      <button className="secondary" onClick={() => setSelectedTenantId(t.id)}>
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail && (
            <div className="card">
              <h2>
                {detail.tenant.name} {detail.tenant.planOverride && <span className="badge">override</span>}
              </h2>
              <p>
                <span className={`badge ${STATUS_CLASS[detail.tenant.status] ?? ""}`}>{detail.tenant.status}</span>{" "}
                {detail.tenant.manualBlockedAt && (
                  <span className="badge status-bad">
                    Bloqueio manual{detail.tenant.blockReason ? `: ${detail.tenant.blockReason}` : ""}
                  </span>
                )}
              </p>

              <h3 style={{ marginTop: "1rem" }}>Assinatura</h3>
              {detail.subscription ? (
                <table>
                  <tbody>
                    <tr>
                      <td>Situação</td>
                      <td>{detail.subscription.status}</td>
                    </tr>
                    <tr>
                      <td>Preço</td>
                      <td>{brl(detail.subscription.priceCents)} / {detail.subscription.billingCycle === "YEARLY" ? "ano" : "mês"}</td>
                    </tr>
                    <tr>
                      <td>Provedor</td>
                      <td>{detail.subscription.provider}</td>
                    </tr>
                    <tr>
                      <td>Trial até</td>
                      <td>{date(detail.subscription.trialEndsAt)}</td>
                    </tr>
                    <tr>
                      <td>Carência até</td>
                      <td>{date(detail.subscription.graceEndsAt)}</td>
                    </tr>
                    <tr>
                      <td>Último pagamento</td>
                      <td>{date(detail.subscription.lastPaymentAt)}</td>
                    </tr>
                    <tr>
                      <td>Criado em</td>
                      <td>{date(detail.subscription.createdAt)}</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="muted">Sem assinatura.</p>
              )}

              <div className="row" style={{ marginTop: "1rem" }}>
                <label>Provisionar no plano</label>
                <select value={provisionPlanCode} onChange={(e) => setProvisionPlanCode(e.target.value)}>
                  {plans.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name} ({brl(p.priceCents)}/{p.billingCycle === "YEARLY" ? "ano" : "mês"})
                    </option>
                  ))}
                </select>
                <button onClick={() => void provision()} disabled={busy}>
                  Provisionar
                </button>
                <button className="secondary" onClick={() => void simulate("invoice.paid")} disabled={busy}>
                  Simular pagamento
                </button>
                <button className="secondary" onClick={() => void simulate("invoice.payment_failed")} disabled={busy}>
                  Simular falha de pagamento
                </button>
                <button className="secondary" onClick={() => void simulate("subscription.trial_ended")} disabled={busy}>
                  Simular fim do trial
                </button>
                <button className="secondary" onClick={() => void simulate("payment.refunded")} disabled={busy}>
                  Simular reembolso
                </button>
                <button className="secondary" onClick={() => void simulate("subscription.deleted")} disabled={busy}>
                  Simular cancelamento
                </button>
                <button onClick={() => void payOpenInvoice()} disabled={busy}>
                  Baixar fatura (auto-collect)
                </button>
              </div>

              <div className="row" style={{ marginTop: "0.5rem" }}>
                <button className="secondary" onClick={() => void changeTenantStatus("BLOCKED", "Bloqueio manual pelo MASTER")} disabled={busy}>
                  Bloquear manualmente
                </button>
                <button className="secondary" onClick={() => void changeTenantStatus("ACTIVE")} disabled={busy || !detail.tenant.manualBlockedAt}>
                  Desbloquear
                </button>
              </div>

              <h3 style={{ marginTop: "1rem" }}>Faturas</h3>
              <table>
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th>Pago</th>
                    <th>Tentativas</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{date(inv.dueDate)}</td>
                      <td>{brl(inv.amountCents)}</td>
                      <td>{inv.status}</td>
                      <td>{date(inv.paidAt)}</td>
                      <td>{inv.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ marginTop: "1rem" }}>Notificações de cobrança</h3>
              <table>
                <thead>
                  <tr>
                    <th>Motivo</th>
                    <th>Referência</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.notifications.map((n) => (
                    <tr key={n.id}>
                      <td>{n.kind}</td>
                      <td>{date(n.dueDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p className="muted" style={{ marginTop: "1rem" }}>
                Saldo de créditos de destaque: {detail.highlightBalance}
              </p>
            </div>
          )}
        </>
      )}

      {tab === "ledger" && (
        <div className="card">
          <h2>Ledger de webhooks</h2>
          <table>
            <thead>
              <tr>
                <th>Recebido</th>
                <th>Provider</th>
                <th>Tipo</th>
                <th>Evento</th>
                <th>Situação</th>
                <th>Erro</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{date(e.receivedAt)}</td>
                  <td>{e.provider}</td>
                  <td>{e.type}</td>
                  <td className="muted">{e.providerEventId}</td>
                  <td>
                    <span className={`badge ${e.status === "PROCESSED" ? "status-ok" : e.status === "FAILED" ? "status-bad" : "status-warn"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="muted">{e.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PlanEditor({
  plan,
  onSave,
  onToggle,
  busy,
}: {
  plan: PlanRow;
  onSave: (plan: PlanRow, data: Partial<PlanRow>) => Promise<void>;
  onToggle: (plan: PlanRow) => Promise<void>;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<PlanRow>(plan);
  useEffect(() => setDraft(plan), [plan]);

  const set = <K extends keyof PlanRow>(key: K, value: PlanRow[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const tracked: Array<keyof PlanRow> = [
    "name",
    "priceCents",
    "billingCycle",
    "maxProperties",
    "maxUsers",
    "maxLeads",
    "highlightCredits",
    "gracePeriodDays",
    "trialDays",
  ];
  const dirty = tracked.some((k) => draft[k] !== plan[k]);

  return (
    <tr>
      <td>
        <input value={draft.name} onChange={(e) => set("name", e.target.value)} style={{ width: "9rem" }} />
        <span className="muted">({plan.code})</span>
      </td>
      <td>
        <input
          type="number"
          value={draft.priceCents}
          onChange={(e) => set("priceCents", Number(e.target.value))}
          style={{ width: "7rem" }}
        />
      </td>
      <td>
        <select value={draft.billingCycle} onChange={(e) => set("billingCycle", e.target.value as "MONTHLY" | "YEARLY")}>
          <option value="MONTHLY">Mensal</option>
          <option value="YEARLY">Anual</option>
        </select>
      </td>
      <td>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <label title="Máx. imóveis">Imóv.
            <input type="number" value={limitValue(draft.maxProperties)} onChange={(e) => set("maxProperties", parseLimit(e.target.value))} style={{ width: "4.5rem" }} />
          </label>
          <label title="Máx. usuários">Usu.
            <input type="number" value={limitValue(draft.maxUsers)} onChange={(e) => set("maxUsers", parseLimit(e.target.value))} style={{ width: "4.5rem" }} />
          </label>
          <label title="Máx. leads">Leads
            <input type="number" value={limitValue(draft.maxLeads)} onChange={(e) => set("maxLeads", parseLimit(e.target.value))} style={{ width: "4.5rem" }} />
          </label>
        </div>
      </td>
      <td>
        <input
          type="number"
          value={draft.highlightCredits}
          onChange={(e) => set("highlightCredits", Number(e.target.value))}
          style={{ width: "6rem" }}
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.gracePeriodDays}
          onChange={(e) => set("gracePeriodDays", Number(e.target.value))}
          style={{ width: "5rem" }}
        />
      </td>
      <td>
        <input
          type="number"
          value={draft.trialDays}
          onChange={(e) => set("trialDays", Number(e.target.value))}
          style={{ width: "5rem" }}
        />
      </td>
      <td>
        <span className={`badge ${draft.isActive ? "status-ok" : ""}`}>{draft.isActive ? "Ativo" : "Inativo"}</span>
      </td>
      <td>
        <div className="row">
          <button className="secondary" onClick={() => void onSave(plan, {
            name: draft.name,
            priceCents: draft.priceCents,
            billingCycle: draft.billingCycle,
            maxProperties: draft.maxProperties,
            maxUsers: draft.maxUsers,
            maxLeads: draft.maxLeads,
            highlightCredits: draft.highlightCredits,
            gracePeriodDays: draft.gracePeriodDays,
            trialDays: draft.trialDays,
          })} disabled={busy || !dirty}>
            Salvar
          </button>
          <button className="secondary" onClick={() => void onToggle(plan)} disabled={busy}>
            {draft.isActive ? "Desativar" : "Ativar"}
          </button>
        </div>
      </td>
    </tr>
  );
}