import type {
  EmailMessage,
  EmailPayloadMap,
  EmailEvent,
  OutboundEmail,
} from "@/lib/email/types";

/**
 * Dependency-free HTML e-mail template engine.
 *
 * Every dynamic value is HTML-escaped at render time (XSS-safe even when a
 * tenant/lead submits free-text like the lead `message` or property titles).
 * Templates are functional composables returning strings — the renderer is
 * provider-agnostic, so a future move to React Email only changes this module.
 *
 * Layout: table-based (Outlook/Gmail friendly) with inline CSS, dark-mode aware
 * (`prefers-color-scheme`) and a plain-text sibling for every message.
 */

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** pt-BR long date (e.g. "20/08/2026"). */
export function formatDateBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** pt-BR date + time (e.g. "20/08/2026 14:30"). */
export function formatDateTimeBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  return `${formatDateBr(iso)} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function link(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a>`;
}

function footer(appUrl: string): string {
  return `
    <tr>
      <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
        <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">
          imobFlow — plataforma imobiliária multi-inquilino.<br/>
          Recebeu este e-mail por ser usuário da plataforma em <a href="${escapeHtml(appUrl)}" style="color:#6b7280">${escapeHtml(appUrl)}</a>.<br/>
          Não responda este e-mail: mensagens automáticas. Dúvidas? Fale com o suporte da sua conta.
        </p>
      </td>
    </tr>`;
}

function layout(opts: {
  title: string;
  preheader: string;
  bodyHtml: string;
  appUrl: string;
}): string {
  const { title, preheader, bodyHtml, appUrl } = opts;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="color-scheme" content="light dark" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
          <tr>
            <td style="padding:20px 32px;background:#111827">
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px">imobFlow</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px">
              ${bodyHtml}
            </td>
          </tr>
          ${footer(appUrl)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// --- Per-event renderers (typed payloads) ------------------------------------

const renderers: {
  [K in EmailEvent]: (p: EmailPayloadMap[K]) => {
    subject: string;
    preheader: string;
    html: string;
    text: string;
    appUrl: string;
  };
} = {
  welcome: (p) => ({
    subject: `Bem-vindo(a) ao imobFlow, ${p.recipientName}!`,
    preheader: `Sua conta ${p.tenantName} está pronta.`,
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Bem-vindo(a), ${escapeHtml(p.recipientName)}!</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Sua organização <strong>${escapeHtml(p.tenantName)}</strong> está ativa no imobFlow.
        Cadastre seus imóveis, ative destaques e acompanhe leads em tempo real.
      </p>
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard`, "Acessar o painel")}</p>
      <p style="margin:0;font-size:13px;color:#6b7280">Precisa de ajuda? Sua conta tem acesso ao manual do assinante em ${escapeHtml(p.appUrl)}.</p>
    `,
    text: `Bem-vindo(a), ${p.recipientName}!\n\nSua organização ${p.tenantName} está ativa no imobFlow.\nAcesse o painel: ${p.appUrl}/dashboard`,
    appUrl: p.appUrl,
  }),

  account_activation: (p) => ({
    subject: "Ative sua conta para começar",
    preheader: "Confirme seu acesso ao imobFlow.",
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Ative sua conta</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. Para concluir o acesso à plataforma, ative sua conta no link abaixo.
        O link é válido por tempo limitado.
      </p>
      <p style="margin:0 0 20px">${link(p.actionUrl, "Ativar minha conta")}</p>
      <p style="margin:0;font-size:13px;color:#6b7280">Se você não solicitou este e-mail, pode ignorá-lo com segurança.</p>
    `,
    text: `Ative sua conta:\n${p.actionUrl}\n\nSe você não solicitou este e-mail, pode ignorá-lo com segurança.`,
    appUrl: p.appUrl,
  }),

  password_reset: (p) => ({
    subject: "Redefinição de senha",
    preheader: "Use o link para definir uma nova senha.",
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Redefinição de senha</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. Recebemos um pedido para redefinir a senha da sua conta.
        Clique no botão abaixo para definir uma nova senha. O link expira em <strong>${p.expiresInMinutes} minutos</strong>.
      </p>
      <p style="margin:0 0 20px">${link(p.resetUrl, "Redefinir senha")}</p>
      <p style="margin:0;font-size:13px;color:#6b7280">Se você não solicitou a redefinição, ignore este e-mail — sua senha atual continua válida.</p>
    `,
    text: `Redefina sua senha (válido por ${p.expiresInMinutes} minutos):\n${p.resetUrl}\n\nSe não foi você, ignore este e-mail.`,
    appUrl: p.appUrl,
  }),

  subscription_created: (p) => ({
    subject: `Assinatura ${p.planName} confirmada`,
    preheader: `Sua assinatura ${p.planName} está ativa.`,
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Assinatura criada</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. A organização <strong>${escapeHtml(p.tenantName)}</strong> agora está no plano
        <strong>${escapeHtml(p.planName)}</strong> (${escapeHtml(p.cycle)}) por <strong>${escapeHtml(p.amountBRL)}</strong>.
      </p>
      ${p.trialDays && p.trialDays > 0
        ? `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">Você tem <strong>${p.trialDays} dias de teste</strong> — a primeira cobrança ocorre ao final do período.</p>`
        : `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">A primeira cobrança segue o ciclo de faturamento do plano.</p>`}
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard/billing`, "Ver minha assinatura")}</p>
    `,
    text: `Assinatura criada!\n\n${p.tenantName} agora está no plano ${p.planName} (${p.cycle}) por ${p.amountBRL}.\nVer assinatura: ${p.appUrl}/dashboard/billing`,
    appUrl: p.appUrl,
  }),

  invoice_paid: (p) => ({
    subject: "Pagamento aprovado",
    preheader: "Sua fatura foi paga com sucesso.",
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Pagamento aprovado</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. O pagamento de <strong>${escapeHtml(p.amountBRL)}</strong> referente ao plano
        <strong>${escapeHtml(p.planName)}</strong> da organização <strong>${escapeHtml(p.tenantName)}</strong> foi aprovado.
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280">
        Fatura: ${p.invoiceId ? escapeHtml(p.invoiceId) : "—"}<br/>
        Pago em: ${formatDateTimeBr(p.paidAt)}
      </p>
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard/billing`, "Ver faturas")}</p>
    `,
    text: `Pagamento aprovado!\n\n${p.amountBRL} — plano ${p.planName} (${p.tenantName}).\nPago em ${formatDateTimeBr(p.paidAt)}.\nFaturas: ${p.appUrl}/dashboard/billing`,
    appUrl: p.appUrl,
  }),

  invoice_past_due: (p) => ({
    subject: "Fatura em atraso — ação necessária",
    preheader: "Sua fatura venceu. Regularize para evitar a suspensão.",
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#b91c1c">Fatura em atraso</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. A fatura de <strong>${escapeHtml(p.amountBRL)}</strong> do plano
        <strong>${escapeHtml(p.planName)}</strong> (${escapeHtml(p.tenantName)}) venceu em <strong>${formatDateBr(p.dueDate)}</strong>.
      </p>
      ${p.graceEndsAt
        ? `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">Sem o pagamento, a conta será <strong>suspensa em ${formatDateTimeBr(p.graceEndsAt)}</strong>. Seus dados nunca são apagados — regularize para reativar automaticamente.</p>`
        : `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">Regularize o pagamento para manter sua conta ativa. Seus dados nunca são apagados.</p>`}
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard/billing`, "Regularizar fatura")}</p>
    `,
    text: `Fatura em atraso.\n\n${p.amountBRL} — plano ${p.planName} (${p.tenantName}), vencida em ${formatDateBr(p.dueDate)}.${p.graceEndsAt ? `\nSuspensão automática em ${formatDateTimeBr(p.graceEndsAt)}.` : ""}\nRegularize: ${p.appUrl}/dashboard/billing`,
    appUrl: p.appUrl,
  }),

  final_lockout_warning: (p) => ({
    subject: "Conta suspensa — como reativar",
    preheader: "Sua conta foi suspensa por inadimplência.",
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#b91c1c">Acesso suspenso</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. A conta da organização <strong>${escapeHtml(p.tenantName)}</strong> foi
        <strong>suspensa</strong> em <strong>${formatDateTimeBr(p.blockedAt)}</strong>.
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">Motivo: ${escapeHtml(p.reason)}.</p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Nenhum dado foi removido. Assim que o pagamento pendente for regularizado, a conta é reativada automaticamente.
      </p>
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard/billing`, "Regularizar e reativar")}</p>
    `,
    text: `Acesso suspenso.\n\n${p.tenantName} foi suspensa em ${formatDateTimeBr(p.blockedAt)}.\nMotivo: ${p.reason}\nNenhum dado foi removido. Regularize para reativar: ${p.appUrl}/dashboard/billing`,
    appUrl: p.appUrl,
  }),

  account_reactivated: (p) => ({
    subject: "Conta reativada",
    preheader: "Tudo certo — sua conta voltou ao normal.",
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#16a34a">Conta reativada</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. A assinatura de <strong>${escapeHtml(p.tenantName)}</strong> no plano
        <strong>${escapeHtml(p.planName)}</strong> foi reativada. Todos os recursos já estão disponíveis novamente.
      </p>
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard`, "Continuar de onde parou")}</p>
    `,
    text: `Conta reativada!\n\n${p.tenantName} — plano ${p.planName} — está ativa novamente.\nAcesse: ${p.appUrl}/dashboard`,
    appUrl: p.appUrl,
  }),

  new_lead_alert: (p) => ({
    subject: `Novo lead: ${p.leadName}`,
    preheader: `Um novo lead chegou para ${p.tenantName}.`,
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Novo lead recebido</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. A organização <strong>${escapeHtml(p.tenantName)}</strong> recebeu um novo lead:
      </p>
      <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:6px">
        <tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">Nome</td><td style="font-size:14px;color:#111827"><strong>${escapeHtml(p.leadName)}</strong></td></tr>
        ${p.leadEmail ? `<tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">E-mail</td><td style="font-size:14px;color:#111827">${escapeHtml(p.leadEmail)}</td></tr>` : ""}
        ${p.leadPhone ? `<tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">Telefone</td><td style="font-size:14px;color:#111827">${escapeHtml(p.leadPhone)}</td></tr>` : ""}
        ${p.message ? `<tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">Mensagem</td><td style="font-size:14px;color:#111827">${escapeHtml(p.message)}</td></tr>` : ""}
        ${p.propertyTitle ? `<tr><td style="font-size:13px;color:#6b7280">Imóvel</td><td style="font-size:14px;color:#111827">${escapeHtml(p.propertyTitle)}${p.propertyUrl ? ` · <a href="${escapeHtml(p.propertyUrl)}" style="color:#2563eb">ver</a>` : ""}</td></tr>` : ""}
      </table>
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard`, "Abrir leads")}</p>
    `,
    text: `Novo lead: ${p.leadName}\n${p.leadEmail ? `E-mail: ${p.leadEmail}\n` : ""}${p.leadPhone ? `Telefone: ${p.leadPhone}\n` : ""}${p.propertyTitle ? `Imóvel: ${p.propertyTitle}\n` : ""}\nAbra seus leads: ${p.appUrl}/dashboard`,
    appUrl: p.appUrl,
  }),

  visit_request: (p) => ({
    subject: `Visita agendada — ${p.leadName}`,
    preheader: "Um cliente pediu para agendar uma visita.",
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Pedido de visita</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. Um lead de <strong>${escapeHtml(p.tenantName)}</strong> solicitou o agendamento de uma visita:
      </p>
      <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:6px">
        <tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">Nome</td><td style="font-size:14px;color:#111827"><strong>${escapeHtml(p.leadName)}</strong></td></tr>
        ${p.leadPhone ? `<tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">Telefone</td><td style="font-size:14px;color:#111827">${escapeHtml(p.leadPhone)}</td></tr>` : ""}
        ${p.leadEmail ? `<tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">E-mail</td><td style="font-size:14px;color:#111827">${escapeHtml(p.leadEmail)}</td></tr>` : ""}
        ${p.scheduleDate ? `<tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">Data</td><td style="font-size:14px;color:#111827">${escapeHtml(p.scheduleDate)}</td></tr>` : ""}
        ${p.scheduleTime ? `<tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">Horário</td><td style="font-size:14px;color:#111827">${escapeHtml(p.scheduleTime)}</td></tr>` : ""}
        ${p.message ? `<tr><td style="font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6">Mensagem</td><td style="font-size:14px;color:#111827">${escapeHtml(p.message)}</td></tr>` : ""}
        ${p.propertyTitle ? `<tr><td style="font-size:13px;color:#6b7280">Imóvel</td><td style="font-size:14px;color:#111827">${escapeHtml(p.propertyTitle)}${p.propertyUrl ? ` · <a href="${escapeHtml(p.propertyUrl)}" style="color:#2563eb">ver</a>` : ""}</td></tr>` : ""}
      </table>
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard`, "Abrir leads")}</p>
    `,
    text: `Pedido de visita — ${p.leadName}\n${p.leadPhone ? `Telefone: ${p.leadPhone}\n` : ""}${p.scheduleDate ? `Data: ${p.scheduleDate}\n` : ""}${p.scheduleTime ? `Horário: ${p.scheduleTime}\n` : ""}${p.propertyTitle ? `Imóvel: ${p.propertyTitle}\n` : ""}\nAbrir leads: ${p.appUrl}/dashboard`,
    appUrl: p.appUrl,
  }),

  invoice_due_soon: (p) => ({
    subject: `Seu próximo vencimento — ${p.amountBRL}`,
    preheader: `A fatura de ${p.planName} vence em ${formatDateBr(p.dueDate)}.`,
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Próximo vencimento</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. A fatura de <strong>${escapeHtml(p.amountBRL)}</strong> do plano
        <strong>${escapeHtml(p.planName)}</strong> de <strong>${escapeHtml(p.tenantName)}</strong> vence em
        <strong>${formatDateBr(p.dueDate)}</strong>.
      </p>
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard/billing`, "Ver minha fatura")}</p>
      <p style="margin:0;font-size:13px;color:#6b7280">Pague antes do vencimento para manter a conta sempre ativa.</p>
    `,
    text: `Próximo vencimento\n\nOlá, ${p.recipientName}.\nA fatura de ${p.amountBRL} do plano ${p.planName} (${p.tenantName}) vence em ${formatDateBr(p.dueDate)}.\nVer fatura: ${p.appUrl}/dashboard/billing`,
    appUrl: p.appUrl,
  }),

  last_warning: (p) => ({
    subject: "Último aviso antes da suspensão",
    preheader: "Regularize agora ou sua conta será suspensa em breve.",
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#b91c1c">Último aviso</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. A fatura de <strong>${escapeHtml(p.amountBRL)}</strong> do plano
        <strong>${escapeHtml(p.planName)}</strong> (${escapeHtml(p.tenantName)}), vencida em
        <strong>${formatDateBr(p.dueDate)}</strong>, segue em aberto.
      </p>
      ${p.graceEndsAt
        ? `<p style="margin:0 0 16px;font-size:15px;color:#b91c1c;font-weight:600">Este é o último aviso: sem o pagamento, a conta será suspensa em <strong>${formatDateTimeBr(p.graceEndsAt)}</strong>.</p>`
        : `<p style="margin:0 0 16px;font-size:15px;color:#b91c1c;font-weight:600">Este é o último aviso antes da suspensão da conta.</p>`}
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard/billing`, "Regularizar agora")}</p>
      <p style="margin:0;font-size:13px;color:#6b7280">Seus dados nunca são apagados. O pagamento reativa a conta automaticamente.</p>
    `,
    text: `Último aviso — ${p.tenantName}\n\nA fatura de ${p.amountBRL} (plano ${p.planName}) vencida em ${formatDateBr(p.dueDate)} segue em aberto.${p.graceEndsAt ? `\nSuspensão automática em ${formatDateTimeBr(p.graceEndsAt)}.` : ""}\nRegularize: ${p.appUrl}/dashboard/billing`,
    appUrl: p.appUrl,
  }),

  subscription_cancelled: (p) => ({
    subject: "Assinatura cancelada",
    preheader: `O plano ${p.planName} de ${p.tenantName} foi cancelado.`,
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Assinatura cancelada</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. A assinatura do plano <strong>${escapeHtml(p.planName)}</strong> da
        organização <strong>${escapeHtml(p.tenantName)}</strong> foi cancelada em <strong>${formatDateTimeBr(p.cancelledAt)}</strong>.
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Seus dados e imóveis foram preservados. Você pode reassinar um plano a qualquer momento.
      </p>
      <p style="margin:0 0 20px">${link(`${p.appUrl}/dashboard/billing`, "Ver planos")}</p>
      <p style="margin:0;font-size:13px;color:#6b7280">Caso este cancelamento não tenha sido solicitado, fale com o suporte da sua conta.</p>
    `,
    text: `Assinatura cancelada\n\nOlá, ${p.recipientName}.\nO plano ${p.planName} de ${p.tenantName} foi cancelado em ${formatDateTimeBr(p.cancelledAt)}.\nSeus dados foram preservados. Ver planos: ${p.appUrl}/dashboard/billing`,
    appUrl: p.appUrl,
  }),

  payment_link: (p) => ({
    subject: `Link de pagamento — fatura de ${p.amountBRL}`,
    preheader: `Pague sua fatura em atraso pelo link seguro abaixo.`,
    html: `
      <h1 style="margin:0 0 16px;font-size:22px;color:#111827">Link de pagamento</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Olá, ${escapeHtml(p.recipientName)}. A fatura de <strong>${escapeHtml(p.amountBRL)}</strong> do plano
        <strong>${escapeHtml(p.planName)}</strong> de <strong>${escapeHtml(p.tenantName)}</strong> está com vencimento em
        <strong>${formatDateBr(p.dueDate)}</strong>.
      </p>
      <p style="margin:0 0 20px">${link(p.paymentUrl, "Pagar fatura agora")}</p>
      <p style="margin:0;font-size:13px;color:#6b7280">Enviado pela administração da plataforma. Dúvidas? Fale com o suporte da sua conta.</p>
    `,
    text: `Link de pagamento\n\nOlá, ${p.recipientName}.\nFatura de ${p.amountBRL} — plano ${p.planName} (${p.tenantName}), vencimento ${formatDateBr(p.dueDate)}.\nPague agora: ${p.paymentUrl}`,
    appUrl: p.appUrl,
  }),
};

/**
 * Substitute `{{variável}}` placeholders from an e-mail payload. Every inserted
 * value is HTML-escaped when `escape` is true (HTML subject/body — XSS-safe for
 * tenant/lead free-text). Text bodies keep raw values.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, unknown>,
  escape: boolean,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const value = key in vars ? (vars[key] as unknown) : "";
    if (value == null) return "";
    return escape ? escapeHtml(value) : String(value);
  });
}

/**
 * Render a typed message into a provider-agnostic outbound envelope. An optional
 * override (from the `EmailTemplate` store — "administração simples") replaces
 * the code defaults for any field it provides; empty/missing fields keep the
 * built-in template.
 */
export function renderEmail(
  message: EmailMessage,
  override?: {
    subject?: string | null;
    htmlBody?: string | null;
    textBody?: string | null;
  },
): OutboundEmail {
  const r = renderers[message.event](message.payload as never);
  const vars = message.payload as unknown as Record<string, unknown>;

  const subject = override?.subject ? renderTemplate(override.subject, vars, true) : r.subject;
  const bodyHtml = override?.htmlBody ? renderTemplate(override.htmlBody, vars, true) : r.html;
  const text = override?.textBody ? renderTemplate(override.textBody, vars, false) : r.text;

  const dedupeKey = [
    "mail",
    message.event,
    message.to.email.toLowerCase(),
    JSON.stringify(message.payload),
  ].join(":");
  return {
    to: message.to,
    subject,
    html: layout({
      title: subject,
      preheader: r.preheader,
      bodyHtml,
      appUrl: r.appUrl,
    }),
    text,
    dedupeKey,
  };
}

/** Human label used by admin/audit surfaces. */
export const EMAIL_EVENT_LABELS: Record<EmailEvent, string> = {
  welcome: "Boas-vindas",
  account_activation: "Ativação de conta",
  password_reset: "Redefinição de senha",
  subscription_created: "Assinatura criada",
  invoice_paid: "Pagamento aprovado",
  invoice_due_soon: "Próximo vencimento",
  invoice_past_due: "Fatura em atraso",
  last_warning: "Último aviso",
  final_lockout_warning: "Aviso de bloqueio final",
  account_reactivated: "Conta reativada",
  subscription_cancelled: "Assinatura cancelada",
  new_lead_alert: "Alerta de novo lead",
  visit_request: "Pedido de visita",
  payment_link: "Link de pagamento",
};
