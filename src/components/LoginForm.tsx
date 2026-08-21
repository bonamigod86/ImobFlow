"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Loader2, Lock, Mail } from "lucide-react";

const DEMO_PASSWORD = "ChangeMe-123!";

const DEMO_ACCOUNTS = [
  { label: "Proprietário (acme)", email: "owner@acme.com", tenantSlug: "acme" },
  { label: "Corretor (acme)", email: "agent@acme.com", tenantSlug: "acme" },
  { label: "Admin plataforma", email: "admin@saas.local", tenantSlug: "" },
];

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantFromQuery = searchParams?.get("tenant") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState(tenantFromQuery);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, tenantSlug: tenantSlug || undefined }),
      });
      const data = (await res.json()) as { error?: string; message?: string; user?: { role?: string } };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Falha no login.");
        return;
      }
      const isMaster = data.user?.role === "MASTER";
      router.push(isMaster ? "/admin/dashboard" : "/dashboard");
      router.refresh();
    } catch {
      setError("Erro de rede — tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(account: { email: string; tenantSlug: string }) {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setTenantSlug(account.tenantSlug);
    setError(null);
  }

  const inputClass =
    "h-11 w-full rounded-lg border border-slate-200 bg-white pl-11 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="relative">
        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          autoComplete="username"
          required
          className={inputClass}
        />
      </div>

      <div className="relative">
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Sua senha"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>

      <div className="relative">
        <Building2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={tenantSlug}
          onChange={(e) => setTenantSlug(e.target.value)}
          placeholder="Tenant (ex.: acme) — opcional"
          className={inputClass}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="flex h-11 w-full items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-60"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
      </button>

      <div className="pt-2">
        <p className="mb-2 text-xs font-medium text-slate-500">Contas de demonstração</p>
        <div className="flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.email}
              type="button"
              onClick={() => fillDemo(a)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
