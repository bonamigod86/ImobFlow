"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Praivacy / LGPD console (Checklist Item 20).
 *
 * privacy by design: consent is mandatory at every capture (texto/versão,
 * data/hora, IP e origem persistidos). Este painel permite consultar cada lead,
 * ver a finalidade/consentimento registrado e exercer o direito de
 * retirada/anonimização dos dados pessoais.
 */

interface ConsentView {
  version: string;
  finalidade: string;
  grantedAt: string;
  ipAddress: string | null;
  originUrl: string | null;
  optedOut: boolean;
  optedOutAt: string | null;
}

interface PrivacyDetail {
  leadId: string;
  createdAt: string;
  email: string | null;
  type: string;
  consent: ConsentView | null;
  deliveries: number;
  externalSends: Array<{ status: string; deliveredAt: string | null; attempts: number; endpoint: string }>;
}

interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  consentVersion: string | null;
  optedOut: boolean;
}

export default function PrivacyConsole() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [detail, setDetail] = useState<PrivacyDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(path);
    const data = (await res.json()) as T & { error?: string; message?: string };
    if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Falha na requisição.");
    return data;
  }

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchJson<{ items: Array<{ id: string; name: string; email: string | null; createdAt: string; consent: { textVersion: string; optedOut: boolean } | null }> }>("/api/leads?page=1&pageSize=100");
      setLeads(data.items.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        createdAt: l.createdAt,
        consentVersion: l.consent?.textVersion ?? null,
        optedOut: l.consent?.optedOut ?? false,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPrivacy(id: string) {
    setError(null);
    try {
      const { privacy } = await fetchJson<{ privacy: PrivacyDetail }>(`/api/leads/${id}/privacy`);
      setDetail(privacy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar privacidade.");
    }
  }

  async function withdraw(id: string) {
    setError(null);
    if (!window.confirm("Retirar o consentimento e anonimizar os dados deste lead? Esta ação não pode ser desfeita.")) return;
    try {
      const res = await fetch(`/api/leads/${id}/privacy/withdraw`, { method: "POST" });
      const body = (await res.json()) as { error?: string; message?: string };
      if (!res.ok || body.error) throw new Error(body.message ?? body.error ?? "Falha.");
      setDetail(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao retirar consentimento.");
    }
  }

  return (
    <>
      <h1>Privacidade · LGPD</h1>
      <p className="muted">
        Consentimento registrado em cada captura (versão, finalidade, data/hora, IP e origem).
        Retirar o consentimento anonimiza imediatamente os dados pessoais do lead.
      </p>

      {error && <div className="card error">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Lead</th>
              <th>E-mail</th>
              <th>Capturado em</th>
              <th>Consentimento</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td>{l.email ?? "—"}</td>
                <td>{new Date(l.createdAt).toLocaleDateString("pt-BR")}</td>
                <td>
                  {l.optedOut ? (
                    <span className="badge status-warn">Retirado / anonimizado</span>
                  ) : l.consentVersion ? (
                    <span className="badge status-ok">{l.consentVersion}</span>
                  ) : (
                    <span className="badge">Sem registro</span>
                  )}
                </td>
                <td>
                  <div className="row">
                    <button className="secondary" onClick={() => void openPrivacy(l.id)}>
                      Dados e consentimento
                    </button>
                    {!l.optedOut && (
                      <button className="secondary" onClick={() => void withdraw(l.id)}>
                        Retirar / anonimizar
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center" }}>Nenhum lead capturado ainda.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="card">
          <h2>Detalhe de privacidade do lead</h2>
          <table>
            <tbody>
              <tr><td>Capturado em</td><td>{new Date(detail.createdAt).toLocaleString("pt-BR")}</td></tr>
              <tr><td>Tipo</td><td>{detail.type}</td></tr>
              {detail.consent ? (
                <>
                  <tr><td>Versão do consentimento</td><td>{detail.consent.version}</td></tr>
                  <tr><td>Finalidade</td><td>{detail.consent.finalidade}</td></tr>
                  <tr><td>Data/hora da concessão</td><td>{new Date(detail.consent.grantedAt).toLocaleString("pt-BR")}</td></tr>
                  <tr><td>IP de origem</td><td>{detail.consent.ipAddress ?? "—"}</td></tr>
                  <tr><td>URL de origem</td><td>{detail.consent.originUrl ?? "—"}</td></tr>
                  <tr>
                    <td>Retirado</td>
                    <td>
                      {detail.consent.optedOut ? `Sim (${new Date(detail.consent.optedOutAt ?? "").toLocaleString("pt-BR")})` : "Não"}
                    </td>
                  </tr>
                </>
              ) : (
                <tr><td colSpan={2}>Sem registro de consentimento.</td></tr>
              )}
              <tr><td>Envios a sistemas externos</td><td>{detail.deliveries} entrega(s)</td></tr>
            </tbody>
          </table>

          {detail.externalSends.length > 0 && (
            <>
              <h3 style={{ marginTop: "1rem" }}>Rastreabilidade dos envios</h3>
              <table>
                <thead>
                  <tr><th>Destino</th><th>Status</th><th>Data</th><th>Tentativas</th></tr>
                </thead>
                <tbody>
                  {detail.externalSends.map((s, i) => (
                    <tr key={i}>
                      <td>{s.endpoint}</td>
                      <td>{s.status}</td>
                      <td>{s.deliveredAt ? new Date(s.deliveredAt).toLocaleString("pt-BR") : "—"}</td>
                      <td>{s.attempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </>
  );
}
