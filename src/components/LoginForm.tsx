"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
        body: JSON.stringify({
          email,
          password,
          tenantSlug: tenantSlug || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string; user?: { role?: string } };
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Login failed.");
        return;
      }
      // MASTER (plataforma) vai para o painel admin; demais usuários, para o
      // dashboard do assinante.
      const isMaster = data.user?.role === "MASTER";
      router.push(isMaster ? "/admin/dashboard" : "/dashboard");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>E-mail</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="username"
      />
      <label>Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        autoComplete="current-password"
      />
      <label>Tenant slug (optional)</label>
      <input
        type="text"
        value={tenantSlug}
        onChange={(e) => setTenantSlug(e.target.value)}
        placeholder="acme"
      />
      {error ? <p className="error">{error}</p> : null}
      <button type="submit" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}