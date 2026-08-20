import { eventBus } from "@/lib/events/event-bus";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import "./register-mail";

/**
 * Registers domain events -> AuditLog mappings.
 * Imported (side-effect) from the route wrapper and worker bootstrap so the
 * wiring exists in both the web and worker runtimes. Idempotent.
 */

let registered = false;

export function registerAuditSubscribers(): void {
  if (registered) return;
  registered = true;

  eventBus.on("user.login", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      entity: "User",
      entityId: p.userId,
      tenantId: p.tenantId,
      userId: p.userId,
      details: { email: p.email, method: p.method, tenantSlug: p.tenantSlug },
    });
  });

  eventBus.on("user.logout", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.AUTH_LOGOUT,
      entity: "User",
      entityId: p.userId,
      tenantId: p.tenantId,
      userId: p.userId,
    });
  });

  eventBus.on("tenant.status_changed", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.TENANT_STATUS_CHANGED,
      entity: "Tenant",
      entityId: p.tenantId,
      tenantId: p.tenantId,
      userId: p.actorUserId,
      details: { from: p.from, to: p.to, reason: p.reason ?? null },
    });
  });

  eventBus.on("property.deleted", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.PROPERTY_DELETED,
      entity: "Property",
      entityId: p.property.id,
      tenantId: p.tenantId,
      userId: p.userId,
      details: { code: p.property.code, title: p.property.title },
    });
  });

  eventBus.on("integration.failed", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.INTEGRATION_FAILED,
      entity: "Integration",
      entityId: p.integrationId,
      tenantId: p.tenantId,
      details: { error: p.error },
    });
  });

  eventBus.on("integration.delivered", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.WEBHOOK_DELIVERED,
      entity: "WebhookDelivery",
      entityId: p.deliveryId,
      tenantId: p.tenantId,
      userId: null,
      details: {
        leadId: p.leadId,
        endpointId: p.endpointId,
        attemptNumber: p.attemptNumber,
        responseStatus: p.responseStatus,
        executionTimeMs: p.executionTimeMs,
      },
    });
  });

  eventBus.on("integration.parked", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.WEBHOOK_FAILED,
      entity: "WebhookDelivery",
      entityId: p.deliveryId,
      tenantId: p.tenantId,
      userId: null,
      details: { leadId: p.leadId, error: p.error },
    });
  });

  eventBus.on("queue.job.failed", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.JOB_FAILED,
      entity: "QueueJob",
      entityId: p.jobId,
      details: { queueName: p.queueName, error: p.error, attemptsMade: p.attemptsMade },
    });
  });

  eventBus.on("queue.job.replayed", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.JOB_REPLAYED,
      entity: "QueueJob",
      entityId: p.dlqJobId,
      details: { queueName: p.queueName, targetJobId: p.targetJobId },
    });
  });

  // --- Phase 5 — billing lifecycle → audit -----------------------------------

  eventBus.on("billing.event.received", (p) => {
    AuditService.logAsync({
      action:
        p.error === undefined
          ? AUDIT_ACTIONS.BILLING_EVENT_RECEIVED
          : AUDIT_ACTIONS.BILLING_EVENT_FAILED,
      entity: "BillingEvent",
      entityId: p.eventId,
      tenantId: p.tenantId ?? null,
      userId: null,
      details: { provider: p.provider, type: p.type, error: p.error ?? null },
    });
  });

  eventBus.on("billing.subscription.past_due", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.SUBSCRIPTION_PAST_DUE,
      entity: "TenantSubscription",
      entityId: p.subscriptionId,
      tenantId: p.tenantId,
      userId: null,
      details: { amountCents: p.amountCents, graceEndsAt: p.graceEndsAt },
    });
  });

  eventBus.on("billing.subscription.reactivated", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.SUBSCRIPTION_REACTIVATED,
      entity: "TenantSubscription",
      entityId: p.subscriptionId,
      tenantId: p.tenantId,
      userId: null,
      details: { invoiceId: p.invoiceId, amountCents: p.amountCents, paidAt: p.paidAt },
    });
  });

  eventBus.on("billing.subscription.blocked", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.SUBSCRIPTION_BLOCKED,
      entity: "TenantSubscription",
      entityId: p.subscriptionId,
      tenantId: p.tenantId,
      userId: null,
      details: { reason: p.reason, blockedAt: p.blockedAt },
    });
  });

  eventBus.on("billing.subscription.cancelled", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.SUBSCRIPTION_CANCELLED,
      entity: "TenantSubscription",
      entityId: p.subscriptionId,
      tenantId: p.tenantId,
      userId: null,
      details: { cancelledAt: p.cancelledAt },
    });
  });

  eventBus.on("billing.dunning.notified", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.DUNNING_NOTIFIED,
      entity: "BillingNotification",
      entityId: p.subscriptionId ?? "",
      tenantId: p.tenantId,
      userId: null,
      details: { kind: p.kind, dueDate: p.dueDate },
    });
  });

  eventBus.on("billing.highlight.activated", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.HIGHLIGHT_ACTIVATED,
      entity: "PropertyHighlight",
      entityId: p.highlightId,
      tenantId: p.tenantId,
      userId: null,
      details: { propertyId: p.propertyId, endsAt: p.endsAt },
    });
  });

  eventBus.on("billing.highlight.expired", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.HIGHLIGHT_EXPIRED,
      entity: "PropertyHighlight",
      entityId: p.highlightId,
      tenantId: p.tenantId,
      userId: null,
      details: { propertyId: p.propertyId },
    });
  });

  eventBus.on("billing.highlight.purchased", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.HIGHLIGHT_PURCHASED,
      entity: "HighlightPurchase",
      entityId: p.purchaseId,
      tenantId: p.tenantId,
      userId: null,
      details: { credits: p.credits, totalAmountCents: p.totalAmountCents },
    });
  });

  // --- Phase 6 — auth lifecycle + invoice/provision audit -------------------

  eventBus.on("user.created", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.USER_CREATED,
      entity: "User",
      entityId: p.userId,
      tenantId: p.tenantId,
      userId: p.userId,
      details: { tenantName: p.tenantName },
    });
  });

  eventBus.on("user.activated", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.USER_ACTIVATED,
      entity: "User",
      entityId: p.userId,
      tenantId: p.tenantId,
      userId: p.userId,
    });
  });

  eventBus.on("billing.invoice.paid", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.INVOICE_PAID,
      entity: "PaymentInvoice",
      entityId: p.invoiceId ?? "",
      tenantId: p.tenantId,
      userId: null,
      details: { subscriptionId: p.subscriptionId, amountCents: p.amountCents, paidAt: p.paidAt },
    });
  });

  eventBus.on("billing.subscription.provisioned", (p) => {
    AuditService.logAsync({
      action: AUDIT_ACTIONS.SUBSCRIPTION_PROVISIONED,
      entity: "TenantSubscription",
      entityId: p.subscriptionId,
      tenantId: p.tenantId,
      userId: null,
      details: { planCode: p.planCode, planName: p.planName, priceCents: p.priceCents },
    });
  });
}

// Self-register on import: any module that loads the event wiring (route
// wrapper, queue manager, workers) immediately gets audit subscribers attached
// exactly once per process.
registerAuditSubscribers();