import type {
  BillingCycle,
  BillingProvider,
  TenantStatus,
} from "@prisma/client";

/**
 * Phase 5 — Billing & subscription contracts.
 *
 * All monetary values are integer cents (BRL). Decimal precision is preserved
 * end-to-end (stored, transmitted, reported) — never floats.
 */

export const PROVIDER_LABELS: Record<BillingProvider, string> = {
  STRIPE: "Stripe",
  ASAAS: "Asaas",
  CUSTOM: "Gateway custom",
};

export const STATUS_LABELS: Record<TenantStatus, string> = {
  TRIAL: "Trial",
  ACTIVE: "Ativo",
  PENDING_DUE: "Pendente",
  PAST_DUE: "Em atraso",
  BLOCKED: "Bloqueado",
  CANCELLED: "Cancelado",
};

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  MONTHLY: "Mensal",
  YEARLY: "Anual",
};

/**
 * Canonical event emitted by a payment gateway webhook. Providers normalize
 * their own payload into this contract so the state machine is provider-agnostic.
 */
export type BillingEventType =
  | "invoice.paid"
  | "invoice.payment_failed"
  | "invoice.opened"
  | "subscription.updated"
  | "subscription.deleted"
  | "subscription.trial_ended"
  | "checkout.completed"
  | "payment.refunded"
  | "unhandled";

export interface NormalizedBillingEvent {
  /** Provider-guaranteed idempotency key (e.g. Stripe event id). */
  providerEventId: string;
  type: BillingEventType;
  /** Tenant resolved from provider metadata (optional — resolved by subscription later). */
  tenantId?: string;
  /** Plan code in provider metadata (used to provision/upgrade). */
  planCode?: string;
  customerId?: string;
  providerSubscriptionId?: string;
  providerInvoiceId?: string;
  amountCents?: number;
  dueDate?: string;
  paidAt?: string;
  periodStart?: string;
  periodEnd?: string;
  /** Provider concept that maps to TenantStatus (ACTIVE/PAST_DUE/CANCELLED/TRIAL). */
  providerStatus?: string;
  /** For checkout.completed: key that classifies the purchase (`highlight_credits`, `subscription`). */
  metadataKind?: string;
  /** Opaque provider payload (stored verbatim on BillingEvent). */
  raw: unknown;
}

/** Result of processing one normalized event through the billing state machine. */
export interface BillingEventOutcome {
  eventId: string;
  type: BillingEventType;
  processed: boolean;
  tenantId: string | null;
  action?: string;
}

/** Which benefit rows a plan shows on public pricing cards (MASTER-controlled). */
export interface PlanCardShow {
  properties: boolean;
  users: boolean;
  leads: boolean;
  highlightCredits: boolean;
  trialDays: boolean;
}

export const PLAN_CARD_SHOW_DEFAULT: PlanCardShow = {
  properties: true,
  users: true,
  leads: true,
  highlightCredits: true,
  trialDays: true,
};

/** Fill missing/legacy cardShow entries with the default (all visible). */
export function normalizeCardShow(raw: unknown): PlanCardShow {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const flag = (value: unknown): boolean => value !== false;
  return {
    properties: flag(input.properties),
    users: flag(input.users),
    leads: flag(input.leads),
    highlightCredits: flag(input.highlightCredits),
    trialDays: flag(input.trialDays),
  };
}

/** A plan definition as seen by the Master Admin console. */
export interface PlanDefinition {
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  billingCycle: BillingCycle;
  maxProperties: number | null;
  maxUsers: number | null;
  maxLeads: number | null;
  highlightCredits: number;
  gracePeriodDays: number;
  trialDays: number;
  isActive: boolean;
  /** Public pricing-card row visibility (persisted inside `features` JSON). */
  cardShow?: Partial<PlanCardShow>;
}

/** Cents <-> BRL helpers used across billing boundaries. */
export function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}