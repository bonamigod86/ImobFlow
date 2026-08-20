import { prismaUnscoped } from "@/lib/prisma/client";
import { QueueManager } from "@/lib/queues/queue-manager";
import { pingRedis } from "@/lib/redis/client";

/**
 * Delivery reconciler (worker-only, no Next server involvement).
 *
 * Recovers webhook transmissions whose queue job never existed or was lost:
 *   PENDING  — persisted with `attemptsCount = 0` when Redis is down during
 *              `createDeliveryAndEnqueue`: the lead is saved and the durable
 *              row lands PENDING, but no BullMQ job was ever added.
 *   IN_FLIGHT — a job whose worker crashed mid-flight (or whose Redis job was
 *              otherwise lost): status stays IN_FLIGHT with attempts>0.
 * Without a sweep, deliveries in either state would be lost forever
 * (zero-loss guarantee violated).
 *
 * Strategy (safe under every Redis topology):
 *   - candidates: PENDING with `attemptsCount = 0`, `nextAttemptAt = NULL`,
 *     `createdAt` older than a grace window, OR stale IN_FLIGHT with
 *     `updatedAt` older than a longer window (way beyond the bounded retry
 *     budget — max backoff 2s→32s + 10s HTTP timeout per attempt). A row
 *     claimed by any live worker transitions status within milliseconds, so an
 *     old row in these states was effectively never/last processed.
 *   - idempotent: the jobId (`webhook:<endpointId>:lead.created:<leadId>`) is
 *     stable, so re-adding a job still waiting or active in Redis is a no-op;
 *     if it already completed the row would no longer be PENDING/IN_FLIGHT.
 */
const SWEEP_INTERVAL_MS = 60_000;
const UNCLAIMED_AGE_MS = 90_000;
/** IN_FLIGHT older than this (10 min >> max retry window) is considered lost. */
const STUCK_IN_FLIGHT_AGE_MS = 10 * 60_000;
const MAX_STALE_PER_SWEEP = 250;

export async function reclaimStalePendingDeliveries(now = Date.now()): Promise<number> {
  if (!(await pingRedis())) {
    return 0;
  }

  const orphanCutoff = new Date(now - UNCLAIMED_AGE_MS);
  const stuckCutoff = new Date(now - STUCK_IN_FLIGHT_AGE_MS);
  const stale = await prismaUnscoped.webhookDelivery.findMany({
    where: {
      OR: [
        {
          status: "PENDING",
          attemptsCount: 0,
          nextAttemptAt: null,
          createdAt: { lt: orphanCutoff },
        },
        {
          status: "IN_FLIGHT",
          attemptsCount: { gt: 0 },
          updatedAt: { lt: stuckCutoff },
        },
      ],
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
        attemptNumber: delivery.attemptsCount,
      });
      reenqueued += 1;
    } catch (error) {
      console.warn("[workers] delivery-reconciler re-enqueue failed", delivery.id, error);
    }
  }

  if (reenqueued > 0) {
    console.info(`[workers] delivery-reconciler re-enqueued ${reenqueued} stale deliveries.`);
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