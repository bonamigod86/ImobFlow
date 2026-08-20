"use client";

import { Building2 } from "lucide-react";

/** Shown to platform-only identities (MASTER) with no tenant context. */
export function PlatformEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-ink-700 bg-ink-900/40 px-6 py-16 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/15">
        <Building2 className="h-6 w-6 text-brand-300" />
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-ink-50">Visão de plataforma</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-300">
        Este usuário opera no nível da plataforma e não possui um tenant associado.
        Acesse uma conta de proprietário pelo subdomínio do tenant para visualizar
        métricas, imóveis e engajamento.
      </p>
    </div>
  );
}