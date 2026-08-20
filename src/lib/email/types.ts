/**
 * Transactional e-mail contracts (Phase 6).
 *
 * The dispatch surface is an explicit union of every supported message. Each
 * variant carries exactly the fields its template needs — the template
 * renderer is fully typed, so a missing/invalid field fails at compile time,
 * not inside a rendered e-mail.
 */

/** The eleven supported transactional messages. */
export type EmailEvent =
  | "welcome"
  | "account_activation"
  | "password_reset"
  | "subscription_created"
  | "invoice_paid"
  | "invoice_past_due"
  | "final_lockout_warning"
  | "account_reactivated"
  | "new_lead_alert"
  | "visit_request"
  | "payment_link";

export interface MailRecipient {
  email: string;
  name?: string;
}

/** Data contract per event — each variant is rendered by its own template. */
export interface EmailPayloadMap {
  welcome: {
    recipientName: string;
    tenantName: string;
    appUrl: string;
  };
  account_activation: {
    recipientName: string;
    actionUrl: string;
    appUrl: string;
  };
  password_reset: {
    recipientName: string;
    resetUrl: string;
    expiresInMinutes: number;
    appUrl: string;
  };
  subscription_created: {
    recipientName: string;
    tenantName: string;
    planName: string;
    amountBRL: string;
    cycle: string;
    trialDays: number | null;
    appUrl: string;
  };
  invoice_paid: {
    recipientName: string;
    tenantName: string;
    planName: string;
    amountBRL: string;
    invoiceId: string | null;
    paidAt: string;
    appUrl: string;
  };
  invoice_past_due: {
    recipientName: string;
    tenantName: string;
    planName: string;
    amountBRL: string;
    dueDate: string;
    graceEndsAt: string | null;
    appUrl: string;
  };
  final_lockout_warning: {
    recipientName: string;
    tenantName: string;
    reason: string;
    blockedAt: string;
    appUrl: string;
  };
  account_reactivated: {
    recipientName: string;
    tenantName: string;
    planName: string;
    appUrl: string;
  };
  new_lead_alert: {
    recipientName: string;
    tenantName: string;
    leadName: string;
    leadEmail: string | null;
    leadPhone: string | null;
    message: string | null;
    propertyTitle: string | null;
    propertyUrl: string | null;
    appUrl: string;
  };
  visit_request: {
    recipientName: string;
    tenantName: string;
    leadName: string;
    leadPhone: string | null;
    leadEmail: string | null;
    scheduleDate: string | null;
    scheduleTime: string | null;
    message: string | null;
    propertyTitle: string | null;
    propertyUrl: string | null;
    appUrl: string;
  };
  payment_link: {
    recipientName: string;
    tenantName: string;
    planName: string;
    amountBRL: string;
    dueDate: string;
    paymentUrl: string;
    appUrl: string;
  };
}

/** A fully resolved, render-ready message. */
export interface EmailMessage<T extends EmailEvent = EmailEvent> {
  event: T;
  to: MailRecipient;
  payload: EmailPayloadMap[T];
}

/** Provider-agnostic outbound envelope produced by the renderer. */
export interface OutboundEmail {
  to: MailRecipient;
  subject: string;
  html: string;
  text: string;
  /** Stable dedupe key used as the BullMQ jobId (idempotent re-enqueues). */
  dedupeKey: string;
}

/** Transport contract — implementations MUST NOT throw on recipient bounces. */
export interface EmailTransport {
  readonly name: EmailProviderName;
  send(message: OutboundEmail): Promise<void>;
}

export type EmailProviderName = "resend" | "sendgrid" | "ses" | "console";
