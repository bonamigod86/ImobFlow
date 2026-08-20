"use client";

import { useEffect, useState } from "react";
import { useTenant } from "@/lib/tenant/tenant-client-context";
import type { UserRole } from "@prisma/client";

/**
 * /dashboard/billing — tenant self-service billing console.
 *
 * Shows subscription status (plan, price, cycle, next due, grace window),
 * invoice history, dunning notifications and the highlight add-on shop
 * (buy credits → activate on a property → confirm via the CUSTOM gateway).
 * All data comes from tenant-scoped API routes (`billing:self`).
 */

interface TenantBilling {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    manualBlockedAt: string | null;
    plan: { code: string; name: string; priceCents: number; billingCycle: string; trialDays: number } | null;
    planOverride: boolean;
  } | null;
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
  invoices: Array<{
    id: string;
    amountCents: number;
    status: string;
    dueDate: string;
    paidAt: string | null;
    attempts: number;
    createdAt: string;
  }>;
  notifications: Array<{ id: string; kind: string; dueDate: string; createdAt: string }>;
  highlightBalance: number;
}

interface PropertyOption {
  id: string;
  code: string;
  title: string;
}

interface ActiveHighlight {
  id: string;
  property: { id: string; code: string; title: string; city: string | null; state: string | null };
  startsAt: string;
  endsAt: string;
  source: string;
  priorityBoost: number;
}

interface Purchase {
  id: string;
  creditsBought: number;
  unitPriceCents: number;
  totalPriceCents: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function date(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

const STATUS_CLASS: Record<string, string> = {
  ACTIVE: "status-ok",
  TRIAL: "status-ok",
  PAST_DUE: "status-warn",
  BLOCKED: "status-bad",
  CANCELLED: "status-bad",
};

export default function TenantBillingPanel({
  user,
}: {
  user: { name: string; email: string; role: UserRole };
}) {
  const { role } = useTenant();
  const [billing, setBilling] = useState<TenantBilling | null>(null);
  const [highlights, setHighlights] = useState<{ balance: number; highlights: ActiveHighlight[]; purchases: Purchase[] } | null>(null);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [creditPack, setCreditPack] = useState(10);
  const [creditUnitPrice, setCreditUnitPrice] = useState(100);
  const [activePropertyId, setActivePropertyId] = useState("");
  const [activeDays, setActiveDays] = useState(30);

  async function refresh() {
    setError(null);
    try {
      const [b, h, p] = await Promise.all([
        fetch("/api/billing/subscription").then((r) => r.json()),
        fetch("/api/billing/highlights").then((r) => r.json()),
        fetch("/api/properties?pageSize=200").then((r) => r.json()),
      ]);
      if (b.error) throw new Error(b.error);
      if (h.error) throw new Error(h.error);
      if (p.error) throw new Error(p.error);
      setBilling(b);
      setHighlights({ balance: h.balance ?? 0, highlights: h.highlights ?? [], purchases: h.purchases ?? [] });
      setProperties(p.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function run(path: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Falha na operação.");
      await refresh();
      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function buyCredits() {
    if (creditPack < 1) return;
    await run("/api/billing/highlights/purchases", "POST", {
      creditsBought: creditPack,
      unitPriceCents: creditUnitPrice,
      provider: "CUSTOM",
    });
  }

  async function payPurchase(purchaseId: string) {
    await run(`/api/billing/highlights/purchases/${purchaseId}/pay`, "POST");
  }

  async function activate() {
    if (!activePropertyId || activeDays < 1) return;
    await run("/api/billing/highlights/activate", "POST", {
      propertyId: activePropertyId,
      days: activeDays,
      source: "PLAN",
    });
  }

  const sub = billing?.subscription;
  const balance = highlights?.balance ?? 0;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Assinatura e cobrança</h1>
          <p className="muted">
            {user.name} · {user.email}
          </p>
        </div>
        <button className="secondary" onClick={() => void refresh()} disabled={busy}>
          Atualizar
        </button>
      </div>

      {error && <div className="card error">{error}</div>}

      <div className="card">
        <h2>Situação da assinatura</h2>
        {sub ? (
          <>
            <p>
              <span className={`badge ${STATUS_CLASS[sub.status] ?? ""}`}>{sub.status}</span>{" "}
              <span className="badge">{sub.billingCycle === "YEARLY" ? "Anual" : "Mensal"}</span>{" "}
              <span className="badge">R$ {brl(sub.priceCents)}</span>
            </p>
            <table>
              <tbody>
                <tr>
                  <td>Plano</td>
                  <td>{billing?.tenant?.plan?.name ?? "—"}</td>
                </tr>
                <tr>
                  <td>Próximo vencimento</td>
                  <td>{date(sub.nextInvoiceDueAt)}</td>
                </tr>
                <tr>
                  <td>Fim do ciclo atual</td>
                  <td>{date(sub.currentPeriodEnd)}</td>
                </tr>
                <tr>
                  <td>Fim da carência (em atraso)</td>
                  <td>{date(sub.graceEndsAt)}</td>
                </tr>
                <tr>
                  <td>Fim do trial</td>
                  <td>{date(sub.trialEndsAt)}</td>
                </tr>
                <tr>
                  <td>Último pagamento</td>
                  <td>{date(sub.lastPaymentAt)}</td>
                </tr>
              </tbody>
            </table>
          </>
        ) : (
          <p className="muted">Nenhuma assinatura provisionada.</p>
        )}
      </div>

      <div className="card">
        <h2>Faturas</h2>
        {billing && billing.invoices.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Situação</th>
                <th>Pago em</th>
                <th>Tentativas</th>
              </tr>
            </thead>
            <tbody>
              {billing.invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{date(inv.dueDate)}</td>
                  <td>{brl(inv.amountCents)}</td>
                  <td>
                    <span className={`badge ${inv.status === "PAID" ? "status-ok" : inv.status === "OPEN" || inv.status === "OVERDUE" ? "status-warn" : ""}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td>{date(inv.paidAt)}</td>
                  <td>{inv.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Sem faturas.</p>
        )}
      </div>

      <div className="card">
        <h2>Notificações de cobrança</h2>
        {billing && billing.notifications.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Motivo</th>
                <th>Referência</th>
              </tr>
            </thead>
            <tbody>
              {billing.notifications.map((n) => (
                <tr key={n.id}>
                  <td>{n.kind}</td>
                  <td>{date(n.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Nenhuma notificação registrada.</p>
        )}
      </div>

      <div className="card">
        <h2>Imóveis em destaque</h2>
        <p>
          Saldo de créditos: <strong>{balance}</strong> dia(s) de destaque.
        </p>
        {highlights && highlights.highlights.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Imóvel</th>
                <th>Início</th>
                <th>Término</th>
                <th>Origem</th>
                <th>Boost</th>
              </tr>
            </thead>
            <tbody>
              {highlights.highlights.map((h) => (
                <tr key={h.id}>
                  <td>
                    {h.property.title} ({h.property.code})
                  </td>
                  <td>{date(h.startsAt)}</td>
                  <td>{date(h.endsAt)}</td>
                  <td>{h.source}</td>
                  <td>+{h.priorityBoost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Nenhum destaque ativo.</p>
        )}
      </div>

      <div className="card">
        <h2>Destaque um imóvel</h2>
        <label>Imóvel</label>
        <select value={activePropertyId} onChange={(e) => setActivePropertyId(e.target.value)}>
          <option value="">Selecione…</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.title}
            </option>
          ))}
        </select>
        <label>Dias de destaque (1 crédito = 1 dia)</label>
        <input
          type="number"
          min={1}
          value={activeDays}
          onChange={(e) => setActiveDays(Number(e.target.value))}
        />
        <button onClick={() => void activate()} disabled={busy || !activePropertyId}>
          Ativar destaque
        </button>
      </div>

      <div className="card">
        <h2>Comprar créditos</h2>
        <label>Créditos (dias de destaque)</label>
        <input type="number" min={1} value={creditPack} onChange={(e) => setCreditPack(Number(e.target.value))} />
        <label>Preço unitário (centavos por crédito)</label>
        <input type="number" min={0} value={creditUnitPrice} onChange={(e) => setCreditUnitPrice(Number(e.target.value))} />
        <p className="muted">
          Total: {brl(creditPack * creditUnitPrice)} (gateway CUSTOM — confirmado manualmente)
        </p>
        <button onClick={() => void buyCredits()} disabled={busy}>
          Criar pedido
        </button>

        {highlights && highlights.purchases.length > 0 && (
          <table style={{ marginTop: "1rem" }}>
            <thead>
              <tr>
                <th>Criado</th>
                <th>Créditos</th>
                <th>Valor</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {highlights.purchases.map((p) => (
                <tr key={p.id}>
                  <td>{date(p.createdAt)}</td>
                  <td>{p.creditsBought}</td>
                  <td>{brl(p.totalPriceCents)}</td>
                  <td>{p.status}</td>
                  <td>
                    {p.status === "PENDING" && (
                      <button className="secondary" onClick={() => void payPurchase(p.id)} disabled={busy}>
                        Confirmar pagamento
                      </button>
                    )}
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