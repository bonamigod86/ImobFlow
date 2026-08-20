import { prisma } from "@/lib/prisma/client";
import { buildLeadEnvelope } from "@/lib/integrations/envelope";
import { resolveAdapter } from "@/lib/integrations/strategies";
import { decryptSecret } from "@/lib/crypto/secrets";
import { signWebhookPayload } from "@/lib/integrations/signatures";
import { eventBus } from "@/lib/events/event-bus";
import { NonRetryableError } from "@/workers/helpers";
import "../events/register";

/**
 * Lead webhook dispatch core (runs INSIDE the job's tenant context).
 *
 * Responsibilities:
 *   - durable, zero-loss attempt logging (attempt row written BEFORE the HTTP
 *     call, updated with the outcome afterwards),
 *   - strategy-based payload shaping + HMAC signing,
 *   - idempotency (`x-idempotency-key` shared across retries),
 *   - retry classification: 429/5xx/network = retryable (BullMQ exponential
 *     backoff); 4xx = permanent (NonRetryableError -> DLQ).
 */

const DEFAULT_TIMEOUT_MS = 10_000;
/** Cap captured response bodies to keep the attempt log slim. */
const MAX_BODY_CHARS = 4000;
const RETRY_BACKOFF_BASE_MS = 2000;

export interface DeliveryOutcome {
  delivered: boolean;
  status: number;
}

export class LeadDeliveryMissError extends NonRetryableError {}

function approximationOf(text: string | undefined): string | null {
  if (!text) return null;
  return text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…[truncated]` : text;
}

async function markDeliveryRetry(deliveryId: string, attemptNumber: number, error: string): Promise<void> {
  const delay = RETRY_BACKOFF_BASE_MS * 2 ** Math.min(attemptNumber - 1, 6);
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status: "FAILED", lastError: error, nextAttemptAt: new Date(Date.now() + delay) },
  });
}

/** Deliver a lead to its persisted endpoint. Throws: retryable `Error` for
 *  transient failures, `NonRetryableError` for permanent ones. */
export async function deliverLeadWebhook(deliveryId: string, attemptsMade: number): Promise<DeliveryOutcome> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: true },
  });

  if (!delivery) {
    throw new LeadDeliveryMissError(`WebhookDelivery ${deliveryId} not found.`);
  }

  // Idempotent re-runs (e.g. manual DLQ replay) must not double-deliver.
  if (delivery.status === "DELIVERED" && delivery.deliveredAt) {
    return { delivered: true, status: delivery.attemptsCount > 0 ? 200 : 0 };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: delivery.leadId },
    include: { property: true, financeProfile: true },
  });
  if (!lead) {
    throw new LeadDeliveryMissError(`Lead ${delivery.leadId} not found.`);
  }

  const attemptNumber = attemptsMade + 1;
  const adapter = resolveAdapter(delivery.endpoint.strategy);
  const payload = adapter(buildLeadEnvelope(lead));

  const secret = delivery.endpoint.hmacSecret ? decryptSecret(delivery.endpoint.hmacSecret) : "";
  const signatureHead: Record<string, string> = {};
  if (secret) {
    const signed = signWebhookPayload(secret, payload);
    signatureHead["x-webhook-timestamp"] = signed.timestamp;
    signatureHead["x-webhook-signature"] = `sha256=${signed.signature}`;
  }

  const url = delivery.endpoint.baseUrl;
  if (!/^https?:\/\//i.test(url)) {
    throw new LeadDeliveryMissError(`Blocked non-HTTP webhook target: ${url}`);
  }

  const signatureValue = signatureHead["x-webhook-signature"] ?? null;
  const body = JSON.stringify(payload);

  // Durable attempt log — written BEFORE the network call so a crash still
  // leaves an auditable IN_FLIGHT record.
  const attempt = await prisma.webhookDeliveryAttempt.create({
    data: {
      tenantId: delivery.tenantId,
      deliveryId,
      leadId: lead.id,
      endpointId: delivery.endpointId,
      attemptNumber,
      destinationUrl: url,
      requestPayload: payload,
      signature: signatureValue,
      success: false,
    },
  });

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status: "IN_FLIGHT", attemptsCount: attemptNumber, lastError: null, nextAttemptAt: null },
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), delivery.endpoint.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const res = await fetch(url, {
      method: delivery.endpoint.method,
      headers: {
        ...signatureHead,
        "content-type": "application/json",
        "x-idempotency-key": delivery.idempotencyKey,
        "x-webhook-event": "lead.created",
      },
      body,
      signal: controller.signal,
      redirect: "manual",
    });

    const executionTimeMs = Date.now() - startedAt;
    const statusText = res.status.toString();
    let responseBody: string | null = null;
    if (!res.ok) {
      responseBody = approximationOf(await res.text().catch(() => undefined));
    }

    if (res.status === 429 || res.status >= 500) {
      await prisma.webhookDeliveryAttempt.update({
        where: { id: attempt.id },
        data: { responseStatus: res.status, responseBody, executionTimeMs, error: statusText },
      });
      await markDeliveryRetry(deliveryId, attemptNumber, `HTTP ${res.status} — transient.`);
      throw new Error(`Webhook target returned retryable status (${res.status}).`);
    }

    if (!res.ok) {
      // 4xx — permanent rejection: dead-letter immediately.
      await prisma.webhookDeliveryAttempt.update({
        where: { id: attempt.id },
        data: { responseStatus: res.status, responseBody, executionTimeMs, error: `HTTP ${res.status}` },
      });
      await prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: "DEAD_LETTERED", lastError: `HTTP ${res.status} — permanent rejection.`, nextAttemptAt: null },
      });
      eventBus.emit("integration.parked", {
        tenantId: delivery.tenantId,
        deliveryId: delivery.id,
        leadId: lead.id,
        error: `HTTP ${res.status} — permanent rejection.`,
      });
      throw new NonRetryableError(`Webhook target rejected request (${res.status}).`);
    }

    // Success.
    await prisma.webhookDeliveryAttempt.update({
      where: { id: attempt.id },
      data: { responseStatus: res.status, success: true, executionTimeMs },
    });
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: "DELIVERED", deliveredAt: new Date(), lastError: null, nextAttemptAt: null },
    });

    eventBus.emit("integration.delivered", {
      tenantId: delivery.tenantId,
      deliveryId: delivery.id,
      leadId: lead.id,
      endpointId: delivery.endpointId,
      attemptNumber,
      responseStatus: res.status,
      executionTimeMs,
    });

    return { delivered: true, status: res.status };
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    if (err instanceof NonRetryableError) {
      throw err;
    }

    // Network / timeout / abort — retryable.
    await prisma.webhookDeliveryAttempt.update({
      where: { id: attempt.id },
      data: { executionTimeMs: elapsed, error: errorMessage },
    });
    await markDeliveryRetry(deliveryId, attemptNumber, errorMessage);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}