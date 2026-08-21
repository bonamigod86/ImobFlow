"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Master Admin — audit log console (Checklist Item 24).
 *
 * Every critical/administrative operation is persisted to `AuditLog`
 * (assinaturas, planos, bloqueios/desbloqueios, financeiro administrativo,
 * exclusões, integrações, transmissão de leads e falhas). This screen browses
 * the trail with pagination and filters.
 */

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  tenantSlug: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface Page {
  items: AuditRow[];
  pagination: { page: number; pageSize: number; total: number };
}

export default function AuditAdminConsole({ user }: { user: { name: string; email: string; role: string } }) {
  const [page, setPage] = useState<Page | null>(null);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (pageNumber: number) => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pageNumber), pageSize: "50" });
      if (action) params.set("action", action);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      const body = (await res.json()) as Page & { error?: string; message?: string };
      if (!res.ok || body.error) throw new Error(body.message ?? body.error ?? "Falha ao carregar.");
      setPage(body);
      setCur(pageNumber);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setBusy(false);
    }
  }, [action, q]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const totalPages = page ? Math.max(1, Math.ceil(page.pagination.total / page.pagination.pageSize)) : 1;

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Logs e auditoria</h1>
          <p className="muted">{user.name} · Plataforma (MASTER) · trilha de segurança e operações</p>
        </div>
        <button className="secondary" onClick={() => void load(cur)} disabled={busy}>
          Atualizar
        </button>
      </div>

      {error && <div className="card error">{error}</div>}

      <div className="card">
        <div className="row" style={{ flexWrap: "wrap", gap: "0.75rem", alignItems: "end" }}>
          <label>
            Ação
            <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="ex: SUBSCRIPTION_BLOCKED" />
          </label>
          <label>
            Buscar (tenant / e-mail / entidade)
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="slug, e-mail ou id" />
          </label>
          <button onClick={() => void load(1)} disabled={busy}>
            Filtrar
          </button>
        </div>
      </div>

      <div className="card">
        <p className="muted">{page?.pagination.total ?? "…"} registro(s)</p>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Tenant</th>
                <th>Ator</th>
                <th>Detalhes</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {busy && !page ? (
                <tr><td colSpan={7} style={{ textAlign: "center" }}>Carregando…</td></tr>
              ) : (page?.items ?? []).length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center" }}>Nenhum registro com os filtros atuais.</td></tr>
              ) : (
                (page?.items ?? []).map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleString("pt-BR")}</td>
                    <td><code>{r.action}</code></td>
                    <td>{r.entity}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}</td>
                    <td>{r.tenantSlug ?? "—"}</td>
                    <td>{r.actorEmail ?? "—"}</td>
                    <td className="muted">
                      {r.details ? <code style={{ fontSize: "0.72rem" }}>{JSON.stringify(r.details).slice(0, 90)}</code> : "—"}
                    </td>
                    <td>{r.ipAddress ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: "0.75rem", justifyContent: "space-between" }}>
          <button className="secondary" disabled={cur <= 1 || busy} onClick={() => void load(cur - 1)}>
            Anterior
          </button>
          <span className="muted">Página {cur} de {totalPages}</span>
          <button className="secondary" disabled={cur >= totalPages || busy} onClick={() => void load(cur + 1)}>
            Próxima
          </button>
        </div>
      </div>
    </>
  );
}
