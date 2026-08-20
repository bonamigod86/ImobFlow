import type { BillingProvider } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { resolveGateway, type GatewayAdapter } from "@/lib/billing/gateway";
import type {
  BillingEventOutcome,
  NormalizedBillingEvent,
} from "@/lib/billing/types";
import {
  handleCheckoutCompleted,
  handleInvoiceOpened,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handlePaymentRefunded,
  handleSubscriptionDeleted,
  handleSubscriptionUpdated,
  handleTrialEnded,
} from "@/lib/billing/state-machine";
import { eventBus } from "@/lib/events/event-bus";
import "../events/register";

/**
 * Webhook ingestion — the only entry point for provider events.
 *
 * Pipeline per request:
 *   1. signature verification (over the exact raw body bytes);
 *   2. provider normalization into canonical billing events;
 *   3. idempotency ledger: `BillingEvent(provider, providerEventId)` is unique,
 *      so redeliveries (`STRIPE` retries, Asaas re-sends) apply exactly once;
 *   4. dispatch into the subscription state machine.
 *
 * The raw body string is used verbatim for verification and stored as-is in
 * `BillingEvent.payload` — the normalized event is never re-serialized.
 */

export interface IngestWebhookResult {
  provider: string;
  verified: boolean;
  outcomes: BillingEventOutcome[];
}

export async function ingestProviderWebhook(input: {
  provider: BillingProvider;
  rawBody: string;
  headers: Headers;
}): Promise<IngestWebhookResult> {
  const adapter: GatewayAdapter = resolveGateway(input.provider);
  const verified = adapter.verify(input.rawBody, input.headers);
  if (!verified) {
    eventBus.emit("billing.event.received", {
      provider: input.provider,
      eventId: "unknown",
      type: "signature_failed",
      tenantId: null,
      error: "signature verification failed",
    });
    throw new SignatureVerificationError("Webhook signature verification failed.");
  }

  let events: NormalizedBillingEvent[];
  try {
    events = adapter.parse(input.rawBody);
  } catch (error) {
    throw new PayloadParseError("Failed to parse webhook payload.", error);
  }
  if (events.length === 0) {
    eventBus.emit("billing.event.received", {
      provider: input.provider,
      eventId: "none",
      type: "unhandled",
      tenantId: null,
    });
    return { provider: input.provider, verified: true, outcomes: [] };
  }

  const outcomes: BillingEventOutcome[] = [];
  for (const event of events) {
    outcomes.push(await ingestNormalizedEvent(input.provider, event, input.rawBody));
  }
  return { provider: input.provider, verified: true, outcomes };
}

/**
 * Apply a single normalized event exactly once. Returns the ledger row status
 * so the caller can decide how to acknowledge the provider.
 */
export async function ingestNormalizedEvent(
  provider: BillingProvider,
  event: NormalizedBillingEvent,
  rawBody: string,
): Promise<BillingEventOutcome> {
  const ledger = await acquireLedgerRow(provider, event, rawBody);

  if (ledger.status === "PROCESSED") {
    // Already applied by an earlier delivery — acknowledge without side effects.
    return {
      eventId: event.providerEventId,
      type: event.type,
      processed: true,
      tenantId: ledger.tenantId,
      action: "duplicate_ignored",
    };
  }

  if (ledger.status === "FAILED") {
    // A prior attempt crashed mid-transaction. Re-run idempotently: the state
    // machine only advances on irreversible transitions (invoice PAID, status
    // flip), so retries converge.
    await prismaUnscoped.billingEvent.update({
      where: { id: ledger.id },
      data: { status: "RECEIVED", error: null },
    });
  }

  try {
    const outcome = await dispatch(event);
    await prismaUnscoped.billingEvent.update({
      where: { id: ledger.id },
      data: {
        status: "PROCESSED",
        tenantId: outcome.tenantId,
        processedAt: new Date(),
      },
    });
    return outcome;
  } catch (error) {
    await prismaUnscoped.billingEvent.update({
      where: { id: ledger.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        processedAt: new Date(),
      },
    });
    throw error;
  }
}

/**
 * Idempotency gate. Race-safe: the unique constraint on
 * (provider, providerEventId) makes concurrent deliveries converge to one row,
 * and only the creator applies the event.
 */
async function acquireLedgerRow(
  provider: BillingProvider,
  event: NormalizedBillingEvent,
  rawBody: string,
): Promise<{
  id: string;
  status: string;
  tenantId: string | null;
}> {
  try {
    return await prismaUnscoped.billingEvent.create({
      data: {
        provider,
        providerEventId: event.providerEventId,
        type: event.type,
        status: "RECEIVED",
        tenantId: event.tenantId ?? null,
        payload: rawBody,
        receivedAt: new Date(),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return prismaUnscoped.billingEvent.findUniqueOrThrow({
        where: { provider_providerEventId: { provider, providerEventId: event.providerEventId } },
      });
    }
    throw error;
  }
}

function dispatch(event: NormalizedBillingEvent): Promise<BillingEventOutcome> {
  switch (event.type) {
    case "invoice.paid":
      return handleInvoicePaid(event);
    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event);
    case "invoice.opened":
      return handleInvoiceOpened(event);
    case "subscription.trial_ended":
      return handleTrialEnded(event);
    case "payment.refunded":
      return handlePaymentRefunded(event);
    case "subscription.updated":
      return handleSubscriptionUpdated(event);
    case "subscription.deleted":
      return handleSubscriptionDeleted(event);
    case "checkout.completed":
      return handleCheckoutCompleted(event);
    default:
      // unhandled — nothing to transition, just acked.
      return Promise.resolve({
        eventId: event.providerEventId,
        type: event.type,
        processed: true,
        tenantId: event.tenantId ?? null,
        action: "noop",
      });
  }
}

export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureVerificationError";
  }
}

export class PayloadParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PayloadParseError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}