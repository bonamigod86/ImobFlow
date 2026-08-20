"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";

/**
 * Lead Engine ops console: webhook endpoints, routing rules, delivery logs
 * and the Dead-Letter Queue (with manual replay). Talks to the tenant-scoped
 * `/api/*` surfaces; the API remains the source of truth for authz.
 */

interface Endpoint {
  id: string;
  tenantId: string | null;
  name: string;
  strategy: string;
  scope: "REAL_ESTATE" | "FINANCIAL";
  baseUrl: string;
  method: string;
  isActive: boolean;
  timeoutMs: number;
  createdAt: string;
  _count?: { routingRules: number; deliveries: number };
}

interface Rule {
  id: string;
  tenantId: string | null;
  name: string;
  isActive: boolean;
  priority: number;
  city?: string | null;
  state?: string | null;
  minMonthlyIncome?: string | number | null;
  maxMonthlyIncome?: string | number | null;
  minPropertyValue?: string | number | null;
  maxPropertyValue?: string | number | null;
  endpointId: string;
  endpoint?: { id: string; name: string; isActive: boolean };
  createdAt: string;
}

interface Delivery {
  id: string;
  status: string;
  attemptsCount: number;
  createdAt: string;
  endpoint: { id: string; name: string; scope: string };
  _count?: { attempts: number };
}

interface DeliveryDetail extends Delivery {
  idempotencyKey: string;
  endpoint: { id: string; name: string; scope: string; strategy: string; method: string };
  lead: { id: string; name: string; email: string | null; type: string } | null;
  attempts: Array<{
    id: string;
    attemptNumber: number;
    destinationUrl: string;
    signature: string | null;
    responseStatus: number | null;
    responseBody: string | null;
    executionTimeMs: number | null;
    success: boolean;
    error: string | null;
    createdAt: string;
  }>;
}

interface DlqItem {
  jobId: string;
  originalJobId: string;
  error: string;
  attemptsMade: number;
  parkedAt: string;
  replayedAt: string | null;
  tenantId: string | null;
}

interface Props {
  user: { name: string; email: string; role: UserRole };
  isMaster: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

const statusClass = (status: string): string => {
  switch (status) {
    case "DELIVERED":
      return "badge status-ok";
    case "DEAD_LETTERED":
      return "badge status-bad";
    case "FAILED":
      return "badge status-warn";
    default:
      return "badge";
  }
};

export default function IntegrationsPanel({ user, isMaster }: Props) {
  const [tab, setTab] = useState<"endpoints" | "rules" | "deliveries" | "dlq">("endpoints");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Integrações &amp; Lead Engine</h1>
          <p className="muted">
            {user.name} · {user.email} · {isMaster ? "plataforma" : "assinante"}
          </p>
        </div>
      </div>

      <div className="row" style={{ marginBottom: "1rem" }}>
        {(["endpoints", "rules", "deliveries", "dlq"] as const).map((t) => (
          <button key={t} className={tab === t ? "" : "secondary"} onClick={() => setTab(t)}>
            {t === "endpoints" ? "Endpoints" : t === "rules" ? "Rotas" : t === "deliveries" ? "Entregas" : "DLQ"}
          </button>
        ))}
      </div>

      {error ? <p className="error">{error}</p> : null}

      {tab === "endpoints" && <EndpointsTab onError={setError} setBusy={setBusy} busy={busy} />}
      {tab === "rules" && <RulesTab onError={setError} setBusy={setBusy} busy={busy} />}
      {tab === "deliveries" && <DeliveriesTab onError={setError} />}
      {tab === "dlq" && <DlqTab onError={setError} setBusy={setBusy} busy={busy} />}
    </>
  );
}

function EndpointsTab({
  onError,
  setBusy,
  busy,
}: {
  onError: (e: string | null) => void;
  setBusy: (b: boolean) => void;
  busy: boolean;
}) {
  const [items, setItems] = useState<Endpoint[] | null>(null);
  const [form, setForm] = useState({
    name: "",
    baseUrl: "",
    scope: "REAL_ESTATE" as "REAL_ESTATE" | "FINANCIAL",
    strategy: "CUSTOM_JSON",
    method: "POST",
    secret: "",
    timeoutMs: "10000",
  });

  const load = useCallback(() => {
    request<{ items: Endpoint[] }>("/api/webhook-endpoints")
      .then((d) => setItems(d.items))
      .catch((e: Error) => onError(e.message));
  }, [onError]);

  useEffect(() => load(), [load]);

  const toggle = async (e: Endpoint) => {
    setBusy(true);
    try {
      await request(`/api/webhook-endpoints/${e.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !e.isActive }),
      });
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const create = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    try {
      await request("/api/webhook-endpoints", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          timeoutMs: Number(form.timeoutMs),
          secret: form.secret || undefined,
        }),
      });
      setForm({ name: "", baseUrl: "", scope: "REAL_ESTATE", strategy: "CUSTOM_JSON", method: "POST", secret: "", timeoutMs: "10000" });
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>Criar endpoint</h2>
        <form onSubmit={create}>
          <div className="row">
            <label>
              Nome
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              URL destino (http/https)
              <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required />
            </label>
          </div>
          <div className="row">
            <label>
              Escopo
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as never })}>
                <option value="REAL_ESTATE">Imobiliário (CRM)</option>
                <option value="FINANCIAL">Financeiro (parceiro)</option>
              </select>
            </label>
            <label>
              Estratégia
              <select value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
                <option value="CUSTOM_JSON">Custom JSON</option>
                <option value="CRM_DEFAULT">CRM padrão</option>
                <option value="FINANCE_DEFAULT">Financeiro padrão</option>
              </select>
            </label>
            <label>
              Método
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </label>
            <label>
              Timeout (ms)
              <input type="number" min={1000} max={60000} value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })} />
            </label>
          </div>
          <label>
            Segredo HMAC (exibido apenas nesta criação)
            <input value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} />
          </label>
          <button disabled={busy}>{busy ? "Salvando…" : "Criar endpoint"}</button>
        </form>
      </div>

      <div className="card">
        <h2>Endpoints ({items?.length ?? 0})</h2>
        {items === null ? (
          <p className="muted">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="muted">Nenhum endpoint configurado.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Escopo</th>
                <th>Estratégia</th>
                <th>URL</th>
                <th>Entregas</th>
                <th>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>
                    <span className="badge">{e.scope}</span>
                  </td>
                  <td>{e.strategy}</td>
                  <td className="muted" style={{ wordBreak: "break-all" }}>
                    {e.baseUrl}
                  </td>
                  <td>{e._count?.deliveries ?? 0}</td>
                  <td>
                    <button className={e.isActive ? "" : "secondary"} disabled={busy} onClick={() => toggle(e)}>
                      {e.isActive ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function RulesTab({
  onError,
  setBusy,
  busy,
}: {
  onError: (e: string | null) => void;
  setBusy: (b: boolean) => void;
  busy: boolean;
}) {
  const [items, setItems] = useState<Rule[] | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [form, setForm] = useState({
    name: "",
    endpointId: "",
    priority: "100",
    city: "",
    state: "",
    minMonthlyIncome: "",
    maxMonthlyIncome: "",
    minPropertyValue: "",
    maxPropertyValue: "",
  });

  const load = useCallback(() => {
    request<{ items: Rule[] }>("/api/routing-rules")
      .then((d) => setItems(d.items))
      .catch((e: Error) => onError(e.message));
    request<{ items: Endpoint[] }>("/api/webhook-endpoints")
      .then((d) => setEndpoints(d.items.filter((x) => x.scope === "FINANCIAL")))
      .catch(() => undefined);
  }, [onError]);

  useEffect(() => load(), [load]);

  const toggle = async (r: Rule) => {
    setBusy(true);
    try {
      await request(`/api/routing-rules/${r.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: !r.isActive }),
      });
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  const create = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    try {
      await request("/api/routing-rules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          endpointId: form.endpointId,
          priority: Number(form.priority),
          city: form.city || undefined,
          state: form.state || undefined,
          minMonthlyIncome: form.minMonthlyIncome === "" ? undefined : Number(form.minMonthlyIncome),
          maxMonthlyIncome: form.maxMonthlyIncome === "" ? undefined : Number(form.maxMonthlyIncome),
          minPropertyValue: form.minPropertyValue === "" ? undefined : Number(form.minPropertyValue),
          maxPropertyValue: form.maxPropertyValue === "" ? undefined : Number(form.maxPropertyValue),
        }),
      });
      setForm({ name: "", endpointId: "", priority: "100", city: "", state: "", minMonthlyIncome: "", maxMonthlyIncome: "", minPropertyValue: "", maxPropertyValue: "" });
      load();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <h2>Criar regra de roteamento financeiro</h2>
        <form onSubmit={create}>
          <div className="row">
            <label>
              Nome
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Endpoint parceiro (FINANCIAL)
              <select value={form.endpointId} onChange={(e) => setForm({ ...form, endpointId: e.target.value })} required>
                <option value="" disabled>
                  — selecione —
                </option>
                {endpoints.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Prioridade (menor = antes)
              <input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label>
              Cidade (opcional)
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </label>
            <label>
              UF (opcional)
              <input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </label>
            <label>
              Renda mín. (R$)
              <input type="number" value={form.minMonthlyIncome} onChange={(e) => setForm({ ...form, minMonthlyIncome: e.target.value })} />
            </label>
            <label>
              Renda máx. (R$)
              <input type="number" value={form.maxMonthlyIncome} onChange={(e) => setForm({ ...form, maxMonthlyIncome: e.target.value })} />
            </label>
            <label>
              Valor imóvel mín. (R$)
              <input type="number" value={form.minPropertyValue} onChange={(e) => setForm({ ...form, minPropertyValue: e.target.value })} />
            </label>
            <label>
              Valor imóvel máx. (R$)
              <input type="number" value={form.maxPropertyValue} onChange={(e) => setForm({ ...form, maxPropertyValue: e.target.value })} />
            </label>
          </div>
          <button disabled={busy || endpoints.length === 0}>{busy ? "Salvando…" : "Criar regra"}</button>
        </form>
      </div>

      <div className="card">
        <h2>Regras ({items?.length ?? 0})</h2>
        {items === null ? (
          <p className="muted">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="muted">Nenhuma regra configurada.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Prioridade</th>
                <th>Nome</th>
                <th>Filtros</th>
                <th>Endpoint</th>
                <th>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const filters = [
                  r.city ? `cidade=${r.city}` : null,
                  r.state ? `uf=${r.state}` : null,
                  r.minMonthlyIncome ? `renda≥${r.minMonthlyIncome}` : null,
                  r.maxMonthlyIncome ? `renda≤${r.maxMonthlyIncome}` : null,
                  r.minPropertyValue ? `valor≥${r.minPropertyValue}` : null,
                  r.maxPropertyValue ? `valor≤${r.maxPropertyValue}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <tr key={r.id}>
                    <td>{r.priority}</td>
                    <td>{r.name}</td>
                    <td className="muted">{filters || "—"}</td>
                    <td>
                      <span className="badge">{r.endpoint?.name ?? r.endpointId}</span>
                    </td>
                    <td>
                      <button className={r.isActive ? "" : "secondary"} disabled={busy} onClick={() => toggle(r)}>
                        {r.isActive ? "Ativa" : "Inativa"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function DeliveriesTab({ onError }: { onError: (e: string | null) => void }) {
  const [items, setItems] = useState<Delivery[] | null>(null);
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);

  useEffect(() => {
    request<{ items: Delivery[] }>(`/api/webhook-deliveries?status=${status}`)
      .then((d) => setItems(d.items))
      .catch((e: Error) => onError(e.message));
  }, [status, onError]);

  const open = (id: string) => {
    request<{ delivery: DeliveryDetail }>(`/api/webhook-deliveries/${id}`)
      .then((d) => setDetail(d.delivery))
      .catch((e: Error) => onError(e.message));
  };

  return (
    <>
      <div className="card">
        <div className="row">
          <h2>Entregas de webhook</h2>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="PENDING">Pendente</option>
            <option value="IN_FLIGHT">Em trânsito</option>
            <option value="DELIVERED">Entregue</option>
            <option value="FAILED">Falhou (retry)</option>
            <option value="DEAD_LETTERED">Dead-lettered</option>
          </select>
        </div>
        {items === null ? (
          <p className="muted">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="muted">Nenhuma entrega.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Lead</th>
                <th>Endpoint</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} onClick={() => open(d.id)} style={{ cursor: "pointer" }}>
                  <td>{d.id.slice(0, 8)}…</td>
                  <td className="muted">{d.id}</td>
                  <td>{d.endpoint.name}</td>
                  <td>
                    <span className={statusClass(d.status)}>{d.status}</span>
                  </td>
                  <td>{d._count?.attempts ?? d.attemptsCount}</td>
                  <td className="muted">{new Date(d.createdAt).toISOString().slice(0, 16).replace("T", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail ? (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Detalhe da entrega</h2>
            <button className="secondary" onClick={() => setDetail(null)}>
              fechar
            </button>
          </div>
          <p className="muted">
            idempotency-key: <code>{detail.idempotencyKey}</code>
          </p>
          {detail.attempts.length === 0 ? (
            <p className="muted">Sem tentativas registradas.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Status</th>
                  <th>Latência</th>
                  <th>Assinatura</th>
                  <th>Resposta</th>
                  <th>Erro</th>
                </tr>
              </thead>
              <tbody>
                {detail.attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.attemptNumber}</td>
                    <td>
                      <span className={a.success ? "badge status-ok" : "badge status-warn"}>
                        {a.success ? "OK" : "FALHA"}
                      </span>
                    </td>
                    <td>{a.executionTimeMs != null ? `${a.executionTimeMs}ms` : "—"}</td>
                    <td className="muted" style={{ wordBreak: "break-all" }}>
                      {a.signature ?? "—"}
                    </td>
                    <td className="muted" style={{ wordBreak: "break-all" }}>
                      {a.responseStatus ? `${a.responseStatus} ${a.responseBody ?? ""}`.slice(0, 120) : "—"}
                    </td>
                    <td className="muted">{a.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </>
  );
}

function DlqTab({
  onError,
  setBusy,
  busy,
}: {
  onError: (e: string | null) => void;
  setBusy: (b: boolean) => void;
  busy: boolean;
}) {
  const [queueName, setQueueName] = useState("webhook-transmission-queue");
  const [items, setItems] = useState<DlqItem[] | null>(null);

  useEffect(() => {
    request<{ items: DlqItem[] }>(`/api/admin/dlq?queueName=${encodeURIComponent(queueName)}`)
      .then((d) => setItems(d.items))
      .catch((e: Error) => onError(e.message));
  }, [queueName, onError]);

  const replay = async (item: DlqItem) => {
    setBusy(true);
    try {
      await request(`/api/jobs/${item.jobId}/replay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queueName }),
      });
      setItems((prev) => (prev ?? []).filter((p) => p.jobId !== item.jobId));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="row">
        <h2>Dead Letter Queue</h2>
        <select value={queueName} onChange={(e) => setQueueName(e.target.value)}>
          <option value="webhook-transmission-queue">webhook-transmission-queue</option>
          <option value="lead-routing-queue">lead-routing-queue</option>
        </select>
      </div>
      <p className="muted">
        Jobs com falha permanente (4xx) ou com retentativas esgotadas. Retrieve manual via replay — reexecuta o job na
        fila original.
      </p>
      {items === null ? (
        <p className="muted">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="muted">Nenhum job na DLQ de {queueName}.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Original</th>
              <th>Attempts</th>
              <th>Erro</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.jobId}>
                <td className="muted">{p.jobId.slice(0, 12)}…</td>
                <td className="muted">{p.originalJobId}</td>
                <td>{p.attemptsMade}</td>
                <td className="muted" style={{ wordBreak: "break-all" }}>
                  {p.error}
                </td>
                <td>
                  <button disabled={busy || !!p.replayedAt} onClick={() => replay(p)}>
                    {p.replayedAt ? "Replayado" : "Replay"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}