import { prismaUnscoped } from "@/lib/prisma/client";
import { QueueManager } from "@/lib/queues/queue-manager";
import { renderEmail } from "@/lib/email/templates";
import type {
  EmailEvent,
  EmailMessage,
  EmailPayloadMap,
  MailRecipient,
  OutboundEmail,
} from "@/lib/email/types";
import "../events/register";

/**
 * NotifyService — the only entry point for dispatching transactional e-mails.
 *
 * Every call renders the message synchronously and enqueues it on the
 * EMAIL_SEND BullMQ queue (the HTTP/worker handler never waits on an SMTP/API
 * round-trip). Failures to ENQUEUE are swallowed and logged: a mail outage
 * must never break a property/lead/billing mutation.
 *
 * Recipient resolution: tenant-level e-mails go to the tenant OWNER(s).
 */

const NOTIFY_NOTE = "[notify] email enqueue failed (non-blocking):";

/**
 * Resolve an admin override (`EmailTemplate`) for the event, then render. A
 * disabled/missing override falls back to the code default template. Reads are
 * best-effort: a store outage never blocks the transactional send.
 */
async function renderEmailAsync(message: EmailMessage): Promise<OutboundEmail> {
  let override: { subject: string | null; htmlBody: string | null; textBody: string | null } | null =
    null;
  try {
    const row = await prismaUnscoped.emailTemplate.findUnique({
      where: { event: message.event },
      select: { subject: true, htmlBody: true, textBody: true, enabled: true },
    });
    if (row?.enabled === false) row.subject = null;
    override = row?.subject || row?.htmlBody || row?.textBody ? row : null;
  } catch {
    /* non-blocking */
  }
  return renderEmail(message, override ?? undefined);
}

async function enqueue(message: EmailMessage): Promise<void> {
  const outbound = await renderEmailAsync(message);
  try {
    await QueueManager.addEmailSend({
      dedupeKey: outbound.dedupeKey,
      event: message.event,
      toEmail: outbound.to.email,
      toName: outbound.to.name,
      subject: outbound.subject,
      html: outbound.html,
      text: outbound.text,
    });
  } catch (err) {
    console.error(NOTIFY_NOTE, message.event, outbound.to.email, err);
  }
}

async function tenantOwnerRecipients(tenantId: string): Promise<MailRecipient[]> {
  const users = await prismaUnscoped.user.findMany({
    where: { tenantId, role: "OWNER", isActive: true },
    select: { email: true, name: true },
  });
  return users.map((u) => ({ email: u.email, name: u.name }));
}

type TenantEvents = Exclude<EmailEvent, "welcome" | "account_activation" | "password_reset">;
type UserEvents = Extract<EmailEvent, "welcome" | "account_activation" | "password_reset">;

/** Dispatch to every active OWNER of a tenant (best-effort). */
async function notifyTenant<K extends TenantEvents>(
  event: K,
  tenantId: string,
  build: (recipient: MailRecipient) => EmailPayloadMap[K],
): Promise<void> {
  const recipients = await tenantOwnerRecipients(tenantId);
  for (const recipient of recipients) {
    await enqueue({ event, to: recipient, payload: build(recipient) } as EmailMessage<K>);
  }
}

/** Dispatch to one user by id (auth flows). */
async function notifyUser<K extends UserEvents>(
  event: K,
  userId: string,
  build: (recipient: MailRecipient) => EmailPayloadMap[K],
): Promise<void> {
  const user = await prismaUnscoped.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, isActive: true },
  });
  if (!user || !user.isActive) return;
  const recipient: MailRecipient = { email: user.email, name: user.name };
  await enqueue({ event, to: recipient, payload: build(recipient) } as EmailMessage<K>);
}

// --- One public function per required event ---------------------------------

/** E-mail #1 — welcome. Fires on user account creation. */
export async function notifyWelcomeAccount(userId: string, opts: {
  tenantName: string;
  appUrl: string;
}): Promise<void> {
  await notifyUser("welcome", userId, (r) => ({
    recipientName: r.name ?? r.email,
    tenantName: opts.tenantName,
    appUrl: opts.appUrl,
  }));
}

/** E-mail #2 — account activation. Fires when an account needs activation. */
export async function notifyAccountActivation(userId: string, opts: {
  actionUrl: string;
  appUrl: string;
}): Promise<void> {
  await notifyUser("account_activation", userId, (r) => ({
    recipientName: r.name ?? r.email,
    actionUrl: opts.actionUrl,
    appUrl: opts.appUrl,
  }));
}

/** E-mail #3 — password reset. Fires from the forgot-password flow. */
export async function notifyPasswordReset(userId: string, opts: {
  resetUrl: string;
  expiresInMinutes: number;
  appUrl: string;
}): Promise<void> {
  await notifyUser("password_reset", userId, (r) => ({
    recipientName: r.name ?? r.email,
    resetUrl: opts.resetUrl,
    expiresInMinutes: opts.expiresInMinutes,
    appUrl: opts.appUrl,
  }));
}

/** E-mail #4 — subscription created (provisioning). */
export async function notifySubscriptionCreated(tenantId: string, opts: {
  tenantName: string;
  planName: string;
  amountBRL: string;
  cycle: string;
  trialDays: number | null;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("subscription_created", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #5 — invoice payment approved. */
export async function notifyInvoicePaid(tenantId: string, opts: {
  tenantName: string;
  planName: string;
  amountBRL: string;
  invoiceId: string | null;
  paidAt: string;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("invoice_paid", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #5b — next due date (renewal reminder, before the due day). */
export async function notifyNextDue(tenantId: string, opts: {
  tenantName: string;
  planName: string;
  amountBRL: string;
  dueDate: string;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("invoice_due_soon", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #6 — invoice past due warning (first payment failure). */
export async function notifyInvoicePastDue(tenantId: string, opts: {
  tenantName: string;
  planName: string;
  amountBRL: string;
  dueDate: string;
  graceEndsAt: string | null;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("invoice_past_due", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #6b — last warning before automatic suspension (LATE_REMINDER). */
export async function notifyLastWarning(tenantId: string, opts: {
  tenantName: string;
  planName: string;
  amountBRL: string;
  dueDate: string;
  graceEndsAt: string | null;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("last_warning", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #7 — final lockout warning (grace expired / account blocked). */
export async function notifyFinalLockout(tenantId: string, opts: {
  tenantName: string;
  reason: string;
  blockedAt: string;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("final_lockout_warning", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #8 — account reactivated after payment. */
export async function notifyAccountReactivated(tenantId: string, opts: {
  tenantName: string;
  planName: string;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("account_reactivated", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #8b — subscription cancelled. */
export async function notifySubscriptionCancelled(tenantId: string, opts: {
  tenantName: string;
  planName: string;
  cancelledAt: string;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("subscription_cancelled", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #9 — new real-estate lead alert. */
export async function notifyNewLeadAlert(tenantId: string, opts: {
  tenantName: string;
  leadName: string;
  leadEmail: string | null;
  leadPhone: string | null;
  message: string | null;
  propertyTitle: string | null;
  propertyUrl: string | null;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("new_lead_alert", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #10 — schedule (visit) request. */
export async function notifyVisitRequest(tenantId: string, opts: {
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
}): Promise<void> {
  await notifyTenant("visit_request", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}

/** E-mail #11 — payment link for an overdue invoice (Master console). */
export async function notifyPaymentLink(tenantId: string, opts: {
  tenantName: string;
  planName: string;
  amountBRL: string;
  dueDate: string;
  paymentUrl: string;
  appUrl: string;
}): Promise<void> {
  await notifyTenant("payment_link", tenantId, (r) => ({
    recipientName: r.name ?? r.email,
    ...opts,
  }));
}