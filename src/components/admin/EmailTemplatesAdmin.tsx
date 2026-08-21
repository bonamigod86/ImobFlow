"use client";

import { useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";

/**
 * Master Admin — e-mail template administration (Checklist Item 15).
 *
 * Lists every transactional event and lets a MASTER override `subject`,
 * `htmlBody` and `textBody` using `{{variável}}` placeholders. Empty fields fall
 * back to the built-in (code) default template — "administração simples", no
 * redeploy needed to tweak wording.
 *
 * Data goes through MASTER-only API routes (`billing:admin`).
 */

interface EmailTemplateRow {
  event: string;
  label: string;
  customized: boolean;
  enabled: boolean;
  subject: string | null;
  htmlBody: string | null;
  textBody: string | null;
  updatedAt: string | null;
}

const PAYLOAD_HINTS: Record<string, string> = {
  welcome: "recipientName, tenantName, appUrl",
  account_activation: "recipientName, actionUrl, appUrl",
  password_reset: "recipientName, resetUrl, expiresInMinutes, appUrl",
  subscription_created: "recipientName, tenantName, planName, amountBRL, cycle, trialDays, appUrl",
  invoice_paid: "recipientName, tenantName, planName, amountBRL, invoiceId, paidAt, appUrl",
  invoice_due_soon: "recipientName, tenantName, planName, amountBRL, dueDate, appUrl",
  invoice_past_due: "recipientName, tenantName, planName, amountBRL, dueDate, graceEndsAt, appUrl",
  last_warning: "recipientName, tenantName, planName, amountBRL, dueDate, graceEndsAt, appUrl",
  final_lockout_warning: "recipientName, tenantName, reason, blockedAt, appUrl",
  account_reactivated: "recipientName, tenantName, planName, appUrl",
  subscription_cancelled: "recipientName, tenantName, planName, cancelledAt, appUrl",
  new_lead_alert: "recipientName, tenantName, leadName, leadEmail, leadPhone, message, propertyTitle, propertyUrl, appUrl",
  visit_request: "recipientName, tenantName, leadName, leadPhone, leadEmail, scheduleDate, scheduleTime, message, propertyTitle, propertyUrl, appUrl",
  payment_link: "recipientName, tenantName, planName, amountBRL, dueDate, paymentUrl, appUrl",
};

export default function EmailTemplatesAdmin({ user }: { user: { name: string; email: string; role: UserRole } }) {
  const [rows, setRows] = useState<EmailTemplateRow[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/email-templates");
      const data = (await res.json()) as { templates?: EmailTemplateRow[]; error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Falha ao carregar.");
      setRows(data.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(t: EmailTemplateRow, body: { subject?: string; htmlBody?: string; textBody?: string; enabled?: boolean }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/email-templates/${t.event}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok || data.error) throw new Error(data.message ?? data.error ?? "Falha ao salvar.");
      await load();
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>E-mails transacionais</h1>
          <p className="muted">{user.name} · Plataforma (MASTER)</p>
        </div>
        <button className="secondary" onClick={() => void load()} disabled={busy}>
          Atualizar
        </button>
      </div>

      <p className="muted" style={{ margin: "0 0 1rem" }}>
        Use <code>{"{{variavel}}"}</code> nos templates — as variáveis são preenchidas no envio
        (ex.: <code>{"{{recipientName}}"}</code>). Campos vazios usam o modelo padrão embutido;
        <code> enabled=false </code> restaura o padrão por completo. Envio real via{" "}
        resend / sendgrid / SES / console (variável <code>EMAIL_PROVIDER</code>).
      </p>

      {error && <div className="card error">{error}</div>}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Evento</th>
              <th>Modelo</th>
              <th>Última edição</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <TemplateRow
                key={t.event}
                row={t}
                hints={PAYLOAD_HINTS[t.event] ?? ""}
                open={open === t.event}
                onToggle={() => setOpen(open === t.event ? null : t.event)}
                onSave={(body) => void save(t, body)}
                busy={busy}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TemplateRow({
  row,
  hints,
  open,
  onToggle,
  onSave,
  busy,
}: {
  row: EmailTemplateRow;
  hints: string;
  open: boolean;
  onToggle: () => void;
  onSave: (body: { subject?: string; htmlBody?: string; textBody?: string; enabled?: boolean }) => void;
  busy: boolean;
}) {
  const [subject, setSubject] = useState(row.subject ?? "");
  const [htmlBody, setHtmlBody] = useState(row.htmlBody ?? "");
  const [textBody, setTextBody] = useState(row.textBody ?? "");
  const [enabled, setEnabled] = useState(row.enabled);

  useEffect(() => {
    setSubject(row.subject ?? "");
    setHtmlBody(row.htmlBody ?? "");
    setTextBody(row.textBody ?? "");
    setEnabled(row.enabled);
  }, [row]);

  return (
    <>
      <tr style={{ background: open ? "rgba(99,102,241,0.08)" : undefined }}>
        <td>{row.label} <span className="muted">({row.event})</span></td>
        <td>
          {row.customized ? (
            <span className={`badge ${enabled ? "status-ok" : ""}`}>{enabled ? "Personalizado" : "Desativado"}</span>
          ) : (
            <span className="badge">Padrão</span>
          )}
        </td>
        <td className="muted">{row.updatedAt ? new Date(row.updatedAt).toLocaleString("pt-BR") : "—"}</td>
        <td>
          <button className="secondary" onClick={onToggle} disabled={busy}>
            {open ? "Fechar" : "Editar"}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4}>
            <div className="card" style={{ margin: "0.5rem 0" }}>
              <p className="muted" style={{ marginTop: 0 }}>
                Variáveis disponíveis: <code>{hints}</code>
              </p>
              <label>
                Assunto
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="deixe vazio = padrão" />
              </label>
              <label>
                Corpo HTML
                <textarea
                  value={htmlBody}
                  onChange={(e) => setHtmlBody(e.target.value)}
                  rows={6}
                  placeholder="deixe vazio = padrão"
                  style={{ fontFamily: "monospace", fontSize: "0.85rem", width: "100%" }}
                />
              </label>
              <label>
                Corpo texto
                <textarea
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  rows={3}
                  placeholder="deixe vazio = padrão"
                  style={{ fontFamily: "monospace", fontSize: "0.85rem", width: "100%" }}
                />
              </label>
              <label>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{" "}
                Usar este template personalizado
              </label>
              <div className="row" style={{ marginTop: "0.75rem" }}>
                <button
                  onClick={() => onSave({ subject, htmlBody, textBody, enabled })}
                  disabled={busy}
                >
                  Salvar
                </button>
                <button className="secondary" onClick={onToggle} disabled={busy}>
                  Cancelar
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}