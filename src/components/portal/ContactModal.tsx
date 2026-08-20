"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Calendar, CheckCircle2, MessageCircle, X } from "lucide-react";
import type { PublicProperty } from "@/lib/public/types";
import { locationLabel, priceFor } from "@/lib/public/format";

/**
 * Lead capture modal on the PDP (Radix Dialog).
 *  - The "WhatsApp" button deep-links to the broker's number (with a
 *    prefilled message); when no number is set it still opens WhatsApp Web.
 *  - The form posts to the public lead-intake API; origin is always SITE_FORM.
 */
export function ContactModal({ property }: { property: PublicProperty }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const price = priceFor(property);
  const waMessage = encodeURIComponent(
    `Olá! Tenho interesse no imóvel "${property.title}" (${property.code} — ${property.city}/${property.state}), anunciado por ${property.tenantName}.`,
  );
  // Deep-link to the broker's registered WhatsApp; digits-only per wa.me spec.
  const waDigits = (property.broker?.phone ?? "").replace(/\D/g, "");
  const waHref = waDigits
    ? `https://wa.me/${waDigits}?text=${waMessage}`
    : `https://wa.me/?text=${waMessage}`;

  async function submit(form: FormData) {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: property.id,
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          message: form.get("message"),
          channel: "form",
          consent: { granted: true, textVersion: "2026-08-19.v1" },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.reason ?? "Não foi possível enviar. Tente novamente.");
      }
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  /** Records the WhatsApp outreach in the broker's funnel (anonymous, LGPD-safe). */
  async function trackWhatsApp() {
    try {
      await fetch("/api/public/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: property.id,
          channel: "whatsapp",
          consent: { granted: true, textVersion: "2026-08-19.v1" },
        }),
      });
    } catch {
      // Non-blocking — the deep-link still opens.
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="grid gap-3 sm:grid-cols-2">
        {waHref && (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void trackWhatsApp()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white transition-colors hover:brightness-95"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
        )}
        <Dialog.Trigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <Calendar className="h-4 w-4" />
            Agendar visita
          </button>
        </Dialog.Trigger>
      </div>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-semibold text-slate-900">Agendar visita</Dialog.Title>
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
                Nossa equipe entrará em contato para confirmar sua visita. {price.label && <span>Valor referência: {price.label}{price.period}.</span>}
              </p>
            </div>
          ) : (
            <form action={submit} className="mt-5 space-y-4">
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

              <div>
                <label htmlFor="message" className="mb-1 block text-xs font-medium text-slate-600">
                  Mensagem
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  defaultValue={`Tenho interesse neste imóvel (${price.label}${price.period ?? ""}).`}
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