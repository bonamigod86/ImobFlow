import type {
  BillingProvider,
} from "@prisma/client";
import { env } from "@/lib/config/env";
import type { NormalizedBillingEvent } from "@/lib/billing/types";
import {
  verifyAsaasSignature,
  verifyCustomSignature,
  verifyStripeSignature,
} from "@/lib/billing/gateway/verify";

/**
 * Payment-gateway webhook adapter — the only provider-specific surface.
 *
 * Each provider implements:
 *   verify  — signature check over the raw body + provider-specific header.
 *   parse   — normalize the provider JSON into canonical billing events that
 *             the (provider-agnostic) state machine can consume.
 *
 * Idempotency lives one layer up: `BillingEvent.providerEventId` is unique per
 * (provider, eventId), so a duplicate or redelivered webhook can never be
 * applied twice.
 */

export interface GatewayAdapter {
  provider: BillingProvider;
  /** Verify authenticity of a raw webhook body. `secret` empty => dev skip. */
  verify(rawBody: string, headers: Headers): boolean;
  /** Normalize a verified raw body into canonical events. */
  parse(rawBody: string): NormalizedBillingEvent[];
}

type AnyRecord = Record<string, unknown>;

function asObject(value: unknown): AnyRecord | null {
  return value != null && typeof value === "object" ? (value as AnyRecord) : null;
}

function metaFrom(value: AnyRecord | null): { tenantId?: string; planCode?: string; kind?: string } {
  const raw = value?.metadata ?? value?.custom ?? value?.metadataJson ?? null;
  const meta = asObject(raw) ?? {};
  const tenantId = typeof meta.tenantId === "string" ? meta.tenantId : undefined;
  const planCode = typeof meta.planCode === "string" ? meta.planCode : undefined;
  const kind = typeof meta.kind === "string" ? meta.kind : undefined;
  return { tenantId, planCode, kind };
}

function iso(date: unknown): string | undefined {
  return typeof date === "string" && date.length > 0 ? date : undefined;
}

function amountToCents(value: unknown): number | undefined {
  if (typeof value === "number") return Math.round(value * 100);
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (!Number.isNaN(n)) return Math.round(n * 100);
  }
  return undefined;
}

/**
 * Stripe amounts arrive in the currency's MINOR units (integer cents for BRL),
 * unlike Asaas which ships the value in currency units. Never rescale.
 */
function stripeCents(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return undefined;
}

// -----------------------------------------------------------------------------
// Stripe — https://stripe.com/docs/webhooks
// -----------------------------------------------------------------------------

export interface StripeEvent {
  id: string;
  type: string;
  data?: { object?: AnyRecord };
}

export function parseStripeEvent(payload: unknown): StripeEvent | null {
  const obj = asObject(payload);
  if (!obj || typeof obj.id !== "string" || typeof obj.type !== "string") return null;
  const data = asObject(obj.data);
  const object = asObject(data?.object) ?? {};
  return { id: obj.id, type: obj.type, data: { object } };
}

export const stripeAdapter: GatewayAdapter = {
  provider: "STRIPE",
  verify(rawBody: string, headers: Headers): boolean {
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return true; // dev mode — no configured secret
    return verifyStripeSignature(secret, rawBody, headers.get("stripe-signature"));
  },

  parse(rawBody: string): NormalizedBillingEvent[] {
    const parsed = JSON.parse(rawBody) as unknown;
    const event = parseStripeEvent(parsed);
    if (!event) return [];
    const object = event.data?.object ?? {};
    const meta = metaFrom(object);
    const base = {
      providerEventId: event.id,
      tenantId: meta.tenantId,
      planCode: meta.planCode,
      metadataKind: meta.kind,
      customerId: str(object.customer),
      providerSubscriptionId: str(object.subscription) ?? str(object.id),
      providerInvoiceId: str(object.id),
      amountCents: stripeCents(object.amount) ?? stripeCents(object.total) ?? stripeCents(object.amount_received),
      raw: parsed,
    };

    switch (event.type) {
      case "invoice.paid":
        return [
          {
            ...base,
            type: "invoice.paid",
            amountCents:
              stripeCents(object.amount_paid) ?? stripeCents(object.amount_due) ?? base.amountCents,
            dueDate: iso(object.due_date) ?? iso(asObject(object.status_transitions)?.paid_at) ?? iso(object.created),
            paidAt: iso(object.paid_at) ?? iso(asObject(object.status_transitions)?.paid_at) ?? new Date().toISOString(),
          },
        ];
      case "invoice.payment_failed":
        return [
          {
            ...base,
            type: "invoice.payment_failed",
            dueDate: iso(object.due_date) ?? iso(object.period_end),
          },
        ];
      case "invoice.created":
        return [
          { ...base, type: "invoice.opened", dueDate: iso(object.due_date) ?? iso(object.created_at) },
        ];
      case "customer.subscription.updated":
        return [{ ...base, type: "subscription.updated", providerStatus: str(object.status) }];
      case "customer.subscription.deleted":
        return [{ ...base, type: "subscription.deleted" }];
      case "checkout.session.completed":
        return [
          {
            ...base,
            type: "checkout.completed",
            providerInvoiceId: str(object.invoice),
            metadataKind: meta.kind,
          },
        ];
      default:
        return [{ ...base, type: "unhandled" }];
    }
  },
};

// -----------------------------------------------------------------------------
// Asaas — https://docs.asaas.com/reference/webhook
// -----------------------------------------------------------------------------

export const asaasAdapter: GatewayAdapter = {
  provider: "ASAAS",
  verify(rawBody: string, headers: Headers): boolean {
    const secret = env.ASAAS_WEBHOOK_SECRET;
    if (!secret) return true;
    return verifyAsaasSignature(secret, rawBody, headers.get("asaas-signature"));
  },

  parse(rawBody: string): NormalizedBillingEvent[] {
    const parsed = JSON.parse(rawBody) as unknown;
    const root = asObject(parsed) ?? {};
    const payment = asObject(root.payment) ?? {};
    const subscription = asObject(root.subscription);
    const eventName = typeof root.event === "string" ? root.event : "";
    const meta = metaFrom(payment);
    const common = {
      providerEventId:
        (typeof root.id === "string" && root.id) ||
        (typeof (payment as AnyRecord).id === "string"
          ? (payment as AnyRecord).id as string
          : `${eventName}:${Date.now()}`),
      tenantId: meta.tenantId,
      planCode: meta.planCode,
      metadataKind: meta.kind,
      customerId: str((payment as AnyRecord).customer) ?? str(root.customer),
      providerSubscriptionId:
        str((subscription as AnyRecord)?.id) ?? str((payment as AnyRecord).subscription),
      providerInvoiceId: str((payment as AnyRecord).id) ?? str(root.payment),
      amountCents: amountToCents((payment as AnyRecord).value),
      raw: parsed,
    } as Omit<NormalizedBillingEvent, "type">;

    const status = str((payment as AnyRecord).status);
    switch (eventName) {
      case "PAYMENT_CONFIRMED":
      case "PAYMENT_RECEIVED":
        return [
          {
            ...common,
            type: "invoice.paid",
            dueDate: iso((payment as AnyRecord).dueDate),
            paidAt: iso((payment as AnyRecord).confirmedDate) ?? new Date().toISOString(),
          },
        ];
      case "PAYMENT_OVERDUE":
      case "PAYMENT_REFUSED":
        return [{ ...common, type: "invoice.payment_failed", dueDate: iso((payment as AnyRecord).dueDate) }];
      case "PAYMENT_CREATED":
        return [{ ...common, type: "invoice.opened", dueDate: iso((payment as AnyRecord).dueDate) }];
      case "SUBSCRIPTION_CANCELLED":
        return [{ ...common, type: "subscription.deleted" }];
      case "PAYMENT_REPROVED": // intentionally leaves the invoice open
        return [{ ...common, type: "invoice.payment_failed", dueDate: iso((payment as AnyRecord).dueDate) }];
      default:
        if (status === "OVERDUE") {
          return [{ ...common, type: "invoice.payment_failed", dueDate: iso((payment as AnyRecord).dueDate) }];
        }
        return [{ ...common, type: "unhandled" }];
    }
  },
};

// -----------------------------------------------------------------------------
// Custom gateway — accepts canonical events directly (integration/simulator).
// -----------------------------------------------------------------------------

export const customAdapter: GatewayAdapter = {
  provider: "CUSTOM",
  verify(rawBody: string, headers: Headers): boolean {
    const secret = env.CUSTOM_WEBHOOK_SECRET;
    if (!secret) return true;
    const sig = headers.get("x-webhook-signature");
    const ts = headers.get("x-webhook-timestamp");
    const body = ts ? `${ts}.${rawBody}` : rawBody;
    return verifyCustomSignature(secret, body, sig);
  },

  parse(rawBody: string): NormalizedBillingEvent[] {
    const parsed = JSON.parse(rawBody) as unknown;
    const root = asObject(parsed) ?? {};
    const data = asObject(root.data) ?? {};
    const type = typeof root.type === "string" ? root.type : "unhandled";
    const meta = metaFrom(root);
    const base = {
      providerEventId:
        typeof root.id === "string" && root.id.length > 0
          ? (root.id as string)
          : `${type}:${Math.random().toString(36).slice(2)}`,
      tenantId: typeof root.tenantId === "string" ? (root.tenantId as string) : meta.tenantId,
      planCode: meta.planCode,
      metadataKind: meta.kind,
      customerId: str(root.customerId) ?? str(data.customerId),
      providerSubscriptionId: str(root.subscriptionId) ?? str(data.subscriptionId),
      providerInvoiceId: str(root.invoiceId) ?? str(data.invoiceId),
      // `amountCents` is already integer cents in the custom convention;
      // `amount` (decimal currency) needs the x100 conversion.
      amountCents:
        stripeCents(root.amountCents ?? data.amountCents) ??
        amountToCents(root.amount ?? data.amount),
      dueDate: iso(root.dueDate ?? data.dueDate),
      paidAt: iso(root.paidAt ?? data.paidAt),
      periodStart: iso(root.periodStart ?? data.periodStart),
      periodEnd: iso(root.periodEnd ?? data.periodEnd),
      providerStatus: str(root.providerStatus ?? data.status),
      raw: parsed,
    } as Omit<NormalizedBillingEvent, "type">;

    return [{ ...base, type: type as NormalizedBillingEvent["type"] }];
  },
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function resolveGateway(provider: BillingProvider): GatewayAdapter {
  switch (provider) {
    case "STRIPE":
      return stripeAdapter;
    case "ASAAS":
      return asaasAdapter;
    case "CUSTOM":
      return customAdapter;
    default:
      return customAdapter;
  }
}