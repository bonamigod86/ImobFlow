import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  formatDateBr,
  formatDateTimeBr,
  renderEmail,
  EMAIL_EVENT_LABELS,
} from "@/lib/email/templates";
import type { EmailEvent, EmailMessage } from "@/lib/email/types";

/**
 * Template engine contract: every one of the 10 required events renders a
 * complete envelope (subject/html/text), every dynamic field is
 * HTML-escaped (XSS), and dedupe keys are stable per (event, recipient).
 */

const events: EmailEvent[] = [
  "welcome",
  "account_activation",
  "password_reset",
  "subscription_created",
  "invoice_paid",
  "invoice_due_soon",
  "invoice_past_due",
  "last_warning",
  "final_lockout_warning",
  "account_reactivated",
  "subscription_cancelled",
  "new_lead_alert",
  "visit_request",
  "payment_link",
];

function makeMessage(event: EmailEvent): EmailMessage {
  const base = {
    to: { email: "Owner@acme.com", name: "Owner Acme" },
    appUrl: "https://imob.example.com",
  };
  switch (event) {
    case "welcome":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", appUrl: base.appUrl } };
    case "account_activation":
      return { event, ...base, payload: { recipientName: "Owner", actionUrl: "https://x/t", appUrl: base.appUrl } };
    case "password_reset":
      return { event, ...base, payload: { recipientName: "Owner", resetUrl: "https://x/r?t=abc", expiresInMinutes: 15, appUrl: base.appUrl } };
    case "subscription_created":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", planName: "Pro", amountBRL: "R$ 499,00", cycle: "Mensal", trialDays: 14, appUrl: base.appUrl } };
    case "invoice_paid":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", planName: "Pro", amountBRL: "R$ 499,00", invoiceId: "inv_1", paidAt: "2026-08-19T10:00:00Z", appUrl: base.appUrl } };
    case "invoice_due_soon":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", planName: "Pro", amountBRL: "R$ 499,00", dueDate: "2026-08-19T00:00:00Z", appUrl: base.appUrl } };
    case "invoice_past_due":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", planName: "Pro", amountBRL: "R$ 499,00", dueDate: "2026-08-10T00:00:00Z", graceEndsAt: "2026-08-17T00:00:00Z", appUrl: base.appUrl } };
    case "last_warning":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", planName: "Pro", amountBRL: "R$ 499,00", dueDate: "2026-08-10T00:00:00Z", graceEndsAt: "2026-08-17T00:00:00Z", appUrl: base.appUrl } };
    case "final_lockout_warning":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", reason: "carência", blockedAt: "2026-08-17T00:00:00Z", appUrl: base.appUrl } };
    case "account_reactivated":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", planName: "Pro", appUrl: base.appUrl } };
    case "subscription_cancelled":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", planName: "Pro", cancelledAt: "2026-08-20T12:00:00Z", appUrl: base.appUrl } };
    case "new_lead_alert":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", leadName: "João <script>", leadEmail: "joao@x.com", leadPhone: "(11) 9", message: "Olá <b>", propertyTitle: "Apto", propertyUrl: "https://x/p", appUrl: base.appUrl } };
    case "visit_request":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", leadName: "Ana", leadPhone: null, leadEmail: null, scheduleDate: "22/08/2026", scheduleTime: "14:00", message: null, propertyTitle: "Casa", propertyUrl: null, appUrl: base.appUrl } };
    case "payment_link":
      return { event, ...base, payload: { recipientName: "Owner", tenantName: "ACME", planName: "Pro", amountBRL: "R$ 499,00", dueDate: "2026-08-10T00:00:00Z", paymentUrl: "https://imob.example.com/dashboard/billing", appUrl: base.appUrl } };
  }
}

describe("renderEmail", () => {
  it.each(events)("renders the %s event end-to-end", (event) => {
    const out = renderEmail(makeMessage(event));
    expect(out.subject.length).toBeGreaterThan(5);
    expect(out.html).toContain("<!DOCTYPE html>");
    expect(out.html).toContain("<html lang=\"pt-BR\">");
    expect(out.text.length).toBeGreaterThan(5);
    expect(out.to.email).toBe("Owner@acme.com");
  });

  it("escapes every dynamic value (XSS-safe)", () => {
    const out = renderEmail(makeMessage("new_lead_alert"));
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("&lt;b&gt;");
    expect(out.text).toContain("<script>");
    expect(out.text).not.toContain("&lt;script&gt;");
  });

  it("produces stable dedupe keys per (event, recipient, payload)", () => {
    const a = renderEmail(makeMessage("invoice_paid"));
    const b = renderEmail(makeMessage("invoice_paid"));
    expect(a.dedupeKey).toBe(b.dedupeKey);
    expect(a.dedupeKey).toContain("invoice_paid");
    expect(a.dedupeKey.split(":")[2]).toBe("owner@acme.com");
  });

  it("has a label for every event", () => {
    for (const event of events) {
      expect(EMAIL_EVENT_LABELS[event]).toBeTruthy();
    }
  });

  it("formats dates in pt-BR", () => {
    expect(formatDateBr("2026-08-19T00:00:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    const local = new Date(2026, 7, 19, 14, 30).toISOString();
    expect(formatDateTimeBr(local)).toBe("19/08/2026 14:30");
  });

  it("escapes untrusted strings defensively", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
    expect(escapeHtml(null)).toBe("");
  });
});

describe("renderEmail with admin override (Item 15 — administração simples)", () => {
  it("substitutes {{variáveis}} from the payload in subject and body", () => {
    const override = {
      subject: "Fatura de {{planName}} — {{amountBRL}}",
      htmlBody: "<p>Olá {{recipientName}}, vence {{dueDate}}.</p>",
      textBody: "Fatura {{amountBRL}} para {{tenantName}}",
    };
    const out = renderEmail(makeMessage("invoice_due_soon"), override);

    expect(out.subject).toBe("Fatura de Pro — R$ 499,00");
    expect(out.html).toContain("Olá Owner, vence");
    expect(out.html).toContain("<!DOCTYPE html>");
    expect(out.text).toBe("Fatura R$ 499,00 para ACME");
  });

  it("escapes injected values in the HTML override (XSS-safe)", () => {
    const override = { htmlBody: "<p>{{leadName}}</p>" };
    const out = renderEmail(makeMessage("new_lead_alert"), override);
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
  });

  it("keeps the built-in default when override fields are absent", () => {
    const out = renderEmail(makeMessage("invoice_paid"), {});
    const def = renderEmail(makeMessage("invoice_paid"));
    expect(out.subject).toBe(def.subject);
    expect(out.html).toBe(def.html);
  });

  it("leaves unknown placeholders and missing vars empty, not broken", () => {
    const out = renderEmail(makeMessage("account_reactivated"), {
      subject: "Oi {{recipientName}} {{naoExiste}}",
      htmlBody: "<p>{{appUrl}}</p>",
    });
    expect(out.subject).toBe("Oi Owner ");
  });
});