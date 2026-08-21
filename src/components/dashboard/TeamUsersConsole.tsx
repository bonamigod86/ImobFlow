"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Tenant team & permissions console (Checklist Item 19).
 * Lists members with their RBAC role, creates new members, changes roles and
 * toggles activation. The MASTER profile is a platform role — never listed or
 * assignable here (a MASTER has no tenantId).
 */

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  AGENT: "Corretor",
  RECEPTIONIST: "Atendente",
};

interface TeamUser {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function TeamUsersConsole() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("AGENT");

  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(path, init);
    const data = (await res.json()) as T & { error?: string; message?: string };
    if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Falha na requisição.");
    return data;
  }

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { users: list } = await fetchJson<{ users: TeamUser[] }>("/api/team/users");
      setUsers(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/team/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      });
      setShowCreate(false);
      setName("");
      setEmail("");
      setRole("AGENT");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar.");
    } finally {
      setBusy(false);
    }
  }

  async function update(u: TeamUser, patch: Record<string, unknown>) {
    setError(null);
    try {
      await fetchJson(`/api/team/users/${u.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar.");
    }
  }

  async function remove(u: TeamUser) {
    setError(null);
    try {
      await fetchJson(`/api/team/users/${u.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir.");
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Usuários e permissões</h1>
        <div className="row">
          <button className="secondary" onClick={() => void load()} disabled={busy}>
            Atualizar
          </button>
          <button onClick={() => setShowCreate((v) => !v)} disabled={busy}>
            {showCreate ? "Cancelar" : "Adicionar membro"}
          </button>
        </div>
      </div>
      <p className="muted">
        Perfis: Proprietário, Gerente, Corretor e Atendente. O acesso de cada um segue a matriz de
        permissões (RBAC) e nunca cruza o limite do seu tenant.
      </p>

      {error && <div className="card error">{error}</div>}

      {showCreate && (
        <div className="card">
          <h3>Novo membro</h3>
          <div className="grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(14rem, 1fr))", gap: "0.5rem" }}>
            <label>
              Nome
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              E-mail
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Perfil
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="row" style={{ marginTop: "0.75rem" }}>
            <button onClick={() => void create()} disabled={busy || !name.trim() || !email.trim()}>
              Criar membro
            </button>
          </div>
          <p className="muted">
            O membro recebeu um acesso pelo e-mail cadastrado (senha de primeiro acesso via &quot;esqueci a senha&quot;).
          </p>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Membro</th>
              <th>E-mail</th>
              <th>Perfil</th>
              <th>Situação</th>
              <th>Último acesso</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => void update(u, { role: e.target.value })}
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={`badge ${u.isActive ? "status-ok" : "status-warn"}`}>
                    {u.isActive ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("pt-BR") : "—"}</td>
                <td>
                  <div className="row">
                    <button className="secondary" onClick={() => void update(u, { isActive: !u.isActive })} disabled={busy}>
                      {u.isActive ? "Desativar" : "Ativar"}
                    </button>
                    <button className="secondary" onClick={() => void remove(u)} disabled={busy}>
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center" }}>Nenhum membro além de você.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
