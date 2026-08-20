"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Banknote,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Home,
  Info,
  MessageCircle,
  TrendingUp,
  X,
} from "lucide-react";
import type { PublicProperty } from "@/lib/public/types";
import { locationLabel, priceFor } from "@/lib/public/format";

type InterestType =
  | "tenho_interesse"
  | "agendar_visita"
  | "falar_anunciante"
  | "saber_mais"
  | "financiamento"
  | "alternativas_aquisicao"
  | "simulacao";

interface InterestOption {
  id: Exclude<InterestType, "falar_anunciante">;
  label: string;
  icon: typeof Home;
}

const CONTACT_INTERESTS: InterestOption[] = [
  { id: "tenho_interesse", label: "Tenho interesse neste imóvel", icon: Home },
  { id: "saber_mais", label: "Quero saber mais", icon: Info },
  { id: "agendar_visita", label: "Quero agendar uma visita", icon: Calendar },
];

const FINANCE_INTERESTS: InterestOption[] = [
  { id: "financiamento", label: "Avaliar opções de financiamento", icon: Banknote },
  { id: "alternativas_aquisicao", label: "Conhecer alternativas para aquisição", icon: TrendingUp },
  { id: "simulacao", label: "Receber uma simulação", icon: Calculator },
];

const LABEL: Record<InterestType, string> = {
  tenho_interesse: "Tenho interesse neste imóvel",
  agendar_visita: "Agendar visita",
  falar_anunciante: "Falar com o anunciante",
  saber_mais: "Quero saber mais",
  financiamento: "Avaliar opções de financiamento",
  alternativas_aquisicao: "Conhecer alternativas para aquisição",
  simulacao: "Receber uma simulação",
};

/** Reads UTM/campaign params from the URL so the lead keeps attribution. */
function readUtm(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  const map: Record<string, string> = {
    source: "utm_source",
    medium: "utm_medium",
    campaign: "utm_campaign",
    content: "utm_content",
    term: "utm_term",
  };
  for (const [key, name] of Object.entries(map)) {
    const v = p.get(name)?.trim();
    if (v) out[key] = v;
  }
  return out;
}

function numOrUndefined(form: FormData, key: string): number | undefined {
  const v = String(form.get(key) ?? "").trim().replace(",", ".");
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Lead capture modal on the PDP — one entry for every CTA of the funnel:
 *    1. Tenho interesse neste imóvel  2. Quero agendar visita
 *    3. Falar com o anunciante        4. Quero saber mais
 *    5. Avaliar opções de financiamento 6. Conhecer alternativas para aquisição
 *    7. Receber uma simulação
 * Every flow persists a lead (LGPD consent required); UTM params are read from
 * the URL and the chosen intent is recorded as `interestType`. WhatsApp capture
 * is anonymous (no PII) and non-blocking.
 */
export function ContactModal({ property }: { property: PublicProperty }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intent, setIntent] = useState<Exclude<InterestType, "falar_anunciante"> | null>(null);

  const price = priceFor(property);
  const waMessage = encodeURIComponent(
    `Olá! Tenho interesse no imóvel "${property.title}" (${property.code} — ${property.city}/${property.state}), anunciado por ${property.tenantName}.`,
  );

  const utm = () => (open ? readUtm() : {});

  async function post(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.reason ?? "Não foi possível enviar. Tente novamente.");
    }
  }

  async function submitContact(form: FormData) {
    setSending(true);
    setError(null);
    try {
      const isVisit = intent === "agendar_visita";
      await post("/api/public/leads", {
        propertyId: property.id,
        name: form.get("name"),
        email: form.get("email"),
        phone: form.get("phone"),
        message: form.get("message"),
        channel: "form",
        interestType: intent,
        schedule: isVisit
          ? {
              date: form.get("date") || undefined,
              time: form.get("time") || undefined,
            }
          : undefined,
        utm: utm(),
        consent: { granted: true, textVersion: "2026-08-19.v1" },
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function submitFinance(form: FormData) {
    setSending(true);
    setError(null);
    try {
      await post("/api/public/financial-leads", {
        propertyId: property.id,
        name: form.get("name"),
        email: form.get("email"),
        phone: form.get("phone"),
        message: form.get("message"),
        interestType: intent,
        monthlyIncome: numOrUndefined(form, "monthlyIncome"),
        downPayment: numOrUndefined(form, "downPayment"),
        utm: utm(),
        consent: { granted: true, textVersion: "2026-08-19.v1" },
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  /** Records the WhatsApp outreach in the broker's funnel (anonymous, LGPD-safe). */
  function trackWhatsApp() {
    try {
      void post("/api/public/leads", {
        propertyId: property.id,
        channel: "whatsapp",
        interestType: "falar_anunciante",
        utm: readUtm(),
        consent: { granted: true, textVersion: "2026-08-19.v1" },
      });
    } catch {
      // Non-blocking — the deep-link still opens.
    }
  }

  const waDigits = (property.broker?.phone ?? "").replace(/\D/g, "");
  const waHref = waDigits
    ? `https://wa.me/${waDigits}?text=${waMessage}`
    : `https://wa.me/?text=${waMessage}`;

  const isFinance =
    intent === "financiamento" || intent === "alternativas_aquisicao" || intent === "simulacao";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setIntent(null);
          setSent(false);
          setError(null);
        }
      }}
    >
      <div className="flex flex-wrap gap-3">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackWhatsApp()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white transition-colors hover:brightness-95"
        >
          <MessageCircle className="h-4 w-4" />
          Falar com o anunciante
        </a>
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <Calendar className="h-4 w-4" />
            Tenho interesse
          </button>
        </Dialog.Trigger>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-900">
                {intent ? LABEL[intent as InterestType] : "Interesse neste imóvel"}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-500">
                {property.title} — {locationLabel(property, { withNeighborhood: true })}
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Fechar">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {sent ? (
            <div className="mt-6 flex flex-col items-center gap-3 pb-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <p className="font-semibold text-slate-900">Solicitação enviada!</p>
              <p className="text-sm text-slate-500">
                {isFinance
                  ? "Nossa equipe e parceiros de crédito entrarão em contato para apresentar as opções."
                  : intent === "agendar_visita"
                    ? "Nossa equipe entrará em contato para confirmar sua visita."
                    : "Nossa equipe entrará em contato para falar sobre este imóvel."}{" "}
                {price.label && <span>Valor referência: {price.label}{price.period}.</span>}
              </p>
            </div>
          ) : intent === null ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-slate-600">Como podemos ajudar? Escolha uma opção:</p>
              <div className="space-y-2">
                {CONTACT_INTERESTS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setIntent(opt.id)}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:border-brand-400 hover:bg-brand-50"
                    >
                      <Icon className="h-4 w-4 text-brand-600" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold text-slate-500">Quero financiar ou adquirir</p>
                <div className="space-y-2">
                  {FINANCE_INTERESTS.map((opt) => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setIntent(opt.id)}
                        className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:border-brand-400 hover:bg-brand-50"
                      >
                        <Icon className="h-4 w-4 text-brand-600" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : isFinance ? (
            <form action={submitFinance} className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="name" className="mb-1 block text-xs font-medium text-slate-600">
                    Nome completo *
                  </label>
                  <input
                    id="name"
                    name="name"
                    required
                    placeholder="Seu nome"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="mb-1 block text-xs font-medium text-slate-600">
                    WhatsApp *
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    required
                    type="tel"
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-600">
                  E-mail
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="voce@email.com"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="monthlyIncome" className="mb-1 block text-xs font-medium text-slate-600">
                    Renda mensal aproximada
                  </label>
                  <input
                    id="monthlyIncome"
                    name="monthlyIncome"
                    inputMode="decimal"
                    placeholder="8.000"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <div>
                  <label htmlFor="downPayment" className="mb-1 block text-xs font-medium text-slate-600">
                    Entrada pretendida
                  </label>
                  <input
                    id="downPayment"
                    name="downPayment"
                    inputMode="decimal"
                    placeholder="100.000"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="message" className="mb-1 block text-xs font-medium text-slate-600">
                  Mensagem
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  defaultValue={`Quero ${LABEL[intent as InterestType].toLowerCase()} para este imóvel (${price.label}${price.period ?? ""}).`}
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {sending ? "Enviando…" : "Enviar solicitação"}
              </button>
              <p className="text-center text-xs text-slate-400">
                Seus dados são usados apenas para contato e análise de aquisição deste imóvel.
              </p>
            </form>
          ) : (
            <form action={submitContact} className="mt-5 space-y-4">
              <button
                type="button"
                onClick={() => setIntent(null)}
                className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-600"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Alterar opção
              </button>
              <div>
                <label htmlFor="name" className="mb-1 block text-xs font-medium text-slate-600">
                  Nome completo *
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  placeholder="Seu nome"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="phone" className="mb-1 block text-xs font-medium text-slate-600">
                    WhatsApp *
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    required
                    type="tel"
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-600">
                    E-mail
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="voce@email.com"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                </div>
              </div>

              {intent === "agendar_visita" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="date" className="mb-1 block text-xs font-medium text-slate-600">
                      Data
                    </label>
                    <input
                      id="date"
                      name="date"
                      type="date"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="time" className="mb-1 block text-xs font-medium text-slate-600">
                      Horário
                    </label>
                    <input
                      id="time"
                      name="time"
                      type="time"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="message" className="mb-1 block text-xs font-medium text-slate-600">
                  Mensagem
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  defaultValue={
                    intent === "agendar_visita"
                      ? `Gostaria de agendar uma visita ao imóvel (${property.code}).`
                      : `Tenho interesse neste imóvel (${price.label}${price.period ?? ""}).`
                  }
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {sending ? "Enviando…" : "Enviar solicitação"}
              </button>
              <p className="text-center text-xs text-slate-400">
                Seus dados são usados apenas para contato sobre este imóvel.
              </p>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}