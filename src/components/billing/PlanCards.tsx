"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Check, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PlanRow {
  id: string;
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
}

interface PlansData {
  plans: PlanRow[];
  currentPlanId: string | null;
  subscription: { status: string; planId: string | null; trialEndsAt: string | null } | null;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function PlanCards() {
  const [data, setData] = useState<PlansData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/plans");
      const body = (await res.json()) as PlansData & { error?: string; message?: string };
      if (!res.ok || body.error) throw new Error(body.message ?? "Falha ao carregar planos.");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function subscribe(code: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planCode: code }),
      });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok || body.error) throw new Error(body.message ?? "Falha ao assinar.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao assinar.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Carregando planos…</p>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Planos e assinatura</h2>
          <p className="text-xs font-medium text-slate-500">
            {data.subscription?.status === "TRIAL" && data.subscription.trialEndsAt
              ? `Trial até ${new Date(data.subscription.trialEndsAt).toLocaleDateString("pt-BR")}`
              : `Assinatura ${data.subscription?.status ?? "—"}`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.plans.map((plan) => {
          const isCurrent = plan.id === data.currentPlanId;
          return (
            <div
              key={plan.code}
              className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${
                isCurrent ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200/80"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                {isCurrent && (
                  <Badge variant="success" className="gap-1">
                    <Check className="h-3 w-3" /> Atual
                  </Badge>
                )}
              </div>
              {plan.description && <p className="mt-1 text-xs text-slate-500">{plan.description}</p>}

              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-slate-900">{plan.priceCents > 0 ? brl(plan.priceCents) : "Grátis"}</span>
                {plan.priceCents > 0 && (
                  <span className="text-xs font-medium text-slate-500">/{plan.billingCycle === "YEARLY" ? "ano" : "mês"}</span>
                )}
              </div>

              <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                <Feature text={limitText(plan.maxProperties, "imóveis")} />
                <Feature text={limitText(plan.maxUsers, "usuários")} />
                <Feature text={limitText(plan.maxLeads, "leads/mês")} />
                <Feature text={`${plan.highlightCredits} créditos de destaque/mês`} />
              </ul>

              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={() => void subscribe(plan.code)}
                  disabled={busy || isCurrent}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-default disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {isCurrent ? "Plano atual" : "Escolher este plano"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2">
      <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />
      {text}
    </li>
  );
}

function limitText(max: number | null, label: string): string {
  return max === null ? `${label} ilimitados` : `Até ${max} ${label}`;
}
