import { prismaUnscoped } from "@/lib/prisma/client";
import { QueueManager } from "@/lib/queues/queue-manager";
import { pingRedis } from "@/lib/redis/client";

/**
 * Delivery reconciler (worker-only, no Next server involvement).
 *
 * Recovers webhook transmissions whose queue job never existed: when Redis is
 * down during `createDeliveryAndEnqueue` the lead is still persisted and the
 * durable `WebhookDelivery` row lands `PENDING` with `attemptsCount = 0` — but
 * no BullMQ job was ever added. Without a sweep those deliveries would be
 * silently lost forever (zero-loss guarantee violated).
 *
 * Strategy (safe under every Redis topology):
 *   - candidates: `PENDING`, `attemptsCount = 0`, `nextAttemptAt = NULL`,
 *     `createdAt` older than a grace window. A row claimed by any worker is
 *     moved to `IN_FLIGHT` within milliseconds (HTTP timeout is bounded), so an
 *     old row in this state was never picked up — re-enqueue is correct.
 *   - idempotent: the jobId (`webhook:<endpointId>:lead.created:<leadId>`) is
 *     stable, so re-adding a job still waiting or active in Redis is a no-op;
 *     if it already completed the row would no longer be PENDING.
 */
const SWEEP_INTERVAL_MS = 60_000;
const UNCLAIMED_AGE_MS = 90_000;
const MAX_STALE_PER_SWEEP = 250;

export async function reclaimStalePendingDeliveries(now = Date.now()): Promise<number> {
  if (!(await pingRedis())) {
    return 0;
  }

  const cutoff = new Date(now - UNCLAIMED_AGE_MS);
  const stale = await prismaUnscoped.webhookDelivery.findMany({
    where: {
      status: "PENDING",
      attemptsCount: 0,
      nextAttemptAt: null,
      createdAt: { lt: cutoff },
    },
    include: {
      endpoint: { select: { id: true, baseUrl: true, method: true, timeoutMs: true } },
    },
    take: MAX_STALE_PER_SWEEP,
  });

  let reenqueued = 0;
  for (const delivery of stale) {
    try {
      await QueueManager.addWebhookTransmission({
        tenantId: delivery.tenantId,
        integrationId: delivery.endpoint.id,
        eventId: `lead.created:${delivery.leadId}`,
        url: delivery.endpoint.baseUrl,
        method: (delivery.endpoint.method as "POST" | "PUT" | "PATCH") || "POST",
        headers: {},
        payload: {},
        timeoutMs: delivery.endpoint.timeoutMs ?? undefined,
        deliveryId: delivery.id,
        attemptNumber: 0,
      });
      reenqueued += 1;
    } catch (error) {
      console.warn("[workers] delivery-reconciler re-enqueue failed", delivery.id, error);
    }
  }

  if (reenqueued > 0) {
    console.info(`[workers] delivery-reconciler re-enqueued ${reenqueued} stale PENDING deliveries.`);
  }
  return reenqueued;
}

/** Start the periodic sweep; returns the interval so callers can clear it. */
export function startDeliveryReconciler(): ReturnType<typeof setInterval> {
  const run = async () => {
    try {
      await reclaimStalePendingDeliveries();
    } catch (error) {
      console.warn("[workers] delivery-reconciler sweep failed", error);
    }
  };
  void run();
  return setInterval(() => void run(), SWEEP_INTERVAL_MS);
}