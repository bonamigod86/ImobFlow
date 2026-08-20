import type { TenantStatus, UserRole } from "@prisma/client";

/**
 * Typed domain event bus (in-process).
 *
 * Emitters (`eventBus.emit`) publish strongly-typed payloads; subscribers
 * (`eventBus.on`) react. This keeps cross-cutting concerns (audit logging,
 * webhook fan-out) decoupled from business logic while preserving type safety.
 *
 * Events are NOT persisted here — durable queues (BullMQ) are used for
 * cross-process delivery. This bus is for in-request/worker reactions.
 */

export interface DomainEventMap {
  "user.login": {
    userId: string;
    tenantId: string | null;
    tenantSlug: string | null;
    email: string;
    method: "password";
  };
  "user.logout": {
    userId: string;
    tenantId: string | null;
  };
  "tenant.status_changed": {
    tenantId: string;
    actorUserId: string | null;
    from: TenantStatus;
    to: TenantStatus;
    reason?: string;
  };
  "property.deleted": {
    tenantId: string;
    userId: string | null;
    property: { id: string; code: string; title: string };
  };
  "property.duplicated": {
    tenantId: string;
    userId: string | null;
    sourceId: string;
    targetId: string;
    code: string;
  };
  "property.media_deleted": {
    tenantId: string;
    userId: string | null;
    propertyId: string;
    mediaId: string;
  };
  "property.media_primary": {
    tenantId: string;
    userId: string | null;
    propertyId: string;
    mediaId: string;
  };
  "integration.failed": {
    tenantId: string | null;
    integrationId: string;
    error: string;
  };
  "integration.delivered": {
    tenantId: string | null;
    deliveryId: string;
    leadId: string;
    endpointId: string;
    attemptNumber: number;
    responseStatus: number;
    executionTimeMs: number;
  };
  "integration.parked": {
    tenantId: string | null;
    deliveryId: string;
    leadId: string;
    error: string;
  };
  /** A durable webhook delivery was created for a lead (routing decision). */
  "lead.dispatch": {
    tenantId: string;
    leadId: string;
    deliveryId: string;
    endpointId: string;
    endpointName: string;
    matchedRuleId: string | null;
    matchedRuleName: string | null;
    leadType: string;
    origin: string;
  };
  "billing.event.received": {
    provider: string;
    eventId: string;
    type: string;
    tenantId: string | null;
    error?: string;
  };
  "billing.subscription.past_due": {
    tenantId: string;
    subscriptionId: string;
    amountCents: number;
    graceEndsAt: string;
  };
  "billing.subscription.reactivated": {
    tenantId: string;
    subscriptionId: string;
    invoiceId: string | null;
    amountCents: number;
    paidAt: string;
  };
  "billing.subscription.blocked": {
    tenantId: string;
    subscriptionId: string;
    reason: string;
    blockedAt: string;
  };
  "billing.subscription.cancelled": {
    tenantId: string;
    subscriptionId: string;
    cancelledAt: string;
  };
  "billing.dunning.notified": {
    tenantId: string;
    subscriptionId: string | null;
    kind: "PRE_DUE" | "PAYMENT_FAILED" | "GRACE_EXPIRED" | "REACTIVATED";
    dueDate: string;
  };
  "billing.highlight.activated": {
    tenantId: string;
    propertyId: string;
    highlightId: string;
    endsAt: string;
  };
  "billing.highlight.expired": {
    tenantId: string;
    propertyId: string;
    highlightId: string;
  };
  "billing.highlight.purchased": {
    tenantId: string;
    purchaseId: string;
    credits: number;
    totalAmountCents: number;
  };
  "billing.invoice.paid": {
    tenantId: string;
    subscriptionId: string;
    invoiceId: string | null;
    amountCents: number;
    paidAt: string;
  };
  "billing.subscription.provisioned": {
    tenantId: string;
    subscriptionId: string;
    planCode: string;
    planName: string;
    priceCents: number;
    billingCycle: "MONTHLY" | "YEARLY";
    trialDays: number;
  };
  "queue.job.failed": {
    queueName: string;
    jobId: string;
    error: string;
    attemptsMade: number;
  };
  "queue.job.replayed": {
    queueName: string;
    dlqJobId: string;
    targetJobId: string;
  };

  // --- Phase 6 — user/auth lifecycle -----------------------------------------
  "user.created": {
    userId: string;
    tenantId: string | null;
    tenantName: string | null;
  };
  "user.activated": {
    userId: string;
    tenantId: string | null;
  };
}

type Listener<T> = (payload: T) => void;

class TypedEventBus {
  private listeners = new Map<keyof DomainEventMap, Set<Listener<never>>>();

  on<K extends keyof DomainEventMap>(event: K, listener: Listener<DomainEventMap[K]>): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as Listener<never>);
    this.listeners.set(event, set);
  }

  off<K extends keyof DomainEventMap>(event: K, listener: Listener<DomainEventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof DomainEventMap>(event: K, payload: DomainEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // A throwing listener must not break other listeners/emitters.
    for (const listener of set) {
      try {
        (listener as Listener<DomainEventMap[K]>)(payload);
      } catch (error) {
        console.error(`[events] listener for "${event}" threw`, error);
      }
    }
  }

  countListeners(event: keyof DomainEventMap): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

export const eventBus = new TypedEventBus();