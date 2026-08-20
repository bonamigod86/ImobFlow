import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisBull } from "@/lib/redis/client";
import { QueueName } from "@/lib/queues/names";
import type { WebhookTransmissionJobData } from "@/lib/queues/types";
import { withTenantContext } from "@/lib/tenant/context";
import { NonRetryableError, attachWorkerObservability, isStandaloneEntry } from "@/workers/helpers";
import { DeadLetterQueue } from "@/lib/queues/dlq";
import { eventBus } from "@/lib/events/event-bus";
import { deliverLeadWebhook } from "@/lib/integrations/delivery";
import "../lib/events/register";

/**
 * webhook-transmission-queue worker.
 *
 * Two dispatch flavours, same queue:
 *   1. Generic integration webhook (no `deliveryId`) — static payload +
 *      headers, retryable/4xx classification, audit reporting.
 *   2. Lead dispatch (`deliveryId` set) — loads delivery + lead, formats by the
 *      endpoint's strategy adapter, HMAC-signs, sends with an idempotency key
 *      and records every attempt in `WebhookDeliveryAttempt`
 *      (see src/lib/integrations/delivery.ts). Executes inside the job's tenant
 *      context so all DB access is auto-scoped.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

async function transmitGenericWebhook(job: Job<WebhookTransmissionJobData>): Promise<{
  delivered: boolean;
  status: number;
}> {
  const { tenantId, url, method, headers, payload, timeoutMs } = job.data;
  if (!/^https?:\/\//i.test(url)) {
    throw new NonRetryableError(`Blocked non-HTTP webhook target: ${url}`);
  }

  return withTenantContext(
    { tenantId, tenantSlug: null, userId: null, role: null },
    async () => {
      await job.updateProgress(10);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);

      try {
        await job.updateProgress(40);
        const res = await fetch(url, {
          method,
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          body: typeof payload === "string" ? payload : JSON.stringify(payload),
          signal: controller.signal,
          redirect: "manual",
        });

        if (res.status === 429 || res.status >= 500) {
          throw new Error(`Webhook target returned retryable status (${res.status}).`);
        }
        if (!res.ok) {
          // 4xx: permanent — do not waste retries.
          throw new NonRetryableError(`Webhook target rejected request (${res.status}).`);
        }

        await job.updateProgress(100);
        return { delivered: true, status: res.status };
      } catch (err) {
        if (err instanceof NonRetryableError) {
          await finalizeNonRetryable(job, err);
          return { delivered: false, status: 0 };
        }
        throw err; // retryable — BullMQ backoff kicks in
      } finally {
        clearTimeout(timer);
      }
    },
  );
}

async function transmitLeadWebhook(job: Job<WebhookTransmissionJobData>): Promise<{
  delivered: boolean;
  status: number;
}> {
  const { tenantId, deliveryId } = job.data;
  if (!deliveryId) throw new Error("deliveryId is required for lead dispatch.");

  return withTenantContext(
    { tenantId, tenantSlug: null, userId: null, role: null },
    async () => {
      try {
        const outcome = await deliverLeadWebhook(deliveryId, job.attemptsMade);
        await job.updateProgress(100);
        return { delivered: outcome.delivered, status: outcome.status };
      } catch (err) {
        if (err instanceof NonRetryableError) {
          await finalizeNonRetryable(job, err);
          return { delivered: false, status: 0 };
        }
        throw err;
      }
    },
  );
}

/**
 * Permanent failure: move the job to a finalized failed state and park the
 * payload in the Dead Letter Queue for manual replay. Idempotent (DLQ add uses
 * a deterministic jobId).
 */
async function finalizeNonRetryable(
  job: Job<WebhookTransmissionJobData>,
  err: NonRetryableError,
): Promise<void> {
  await job.moveToFailed(err, job.id ?? "", true);
  await DeadLetterQueue.park(QueueName.WEBHOOK_TRANSMISSION, job, err).catch((e) =>
    console.error("[dlq] park failed", e),
  );
  eventBus.emit("integration.failed", {
    tenantId: job.data.tenantId,
    integrationId: job.data.integrationId,
    error: err.message,
  });
}

async function processJob(job: Job<WebhookTransmissionJobData>): Promise<{
  delivered: boolean;
  status: number;
}> {
  if (job.data.deliveryId) {
    return transmitLeadWebhook(job);
  }
  return transmitGenericWebhook(job);
}

export function createWebhookWorker(): Worker {
  const worker = new Worker<WebhookTransmissionJobData>(
    QueueName.WEBHOOK_TRANSMISSION,
    processJob,
    { connection: redisBull, concurrency: 10 },
  );
  attachWorkerObservability(worker, QueueName.WEBHOOK_TRANSMISSION);
  return worker;
}

// Allow direct execution: `tsx src/workers/webhook-transmission.worker.ts`
if (isStandaloneEntry("workers/webhook-transmission.worker.ts")) {
  const worker = createWebhookWorker();
  console.info(`[worker:${QueueName.WEBHOOK_TRANSMISSION}] started`);

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}