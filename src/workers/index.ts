import "dotenv/config";
import "../lib/events/register";
import { QueueName } from "@/lib/queues/names";
import { QueueManager } from "@/lib/queues/queue-manager";
import { createLeadRoutingWorker } from "@/workers/lead-routing.worker";
import { createWebhookWorker } from "@/workers/webhook-transmission.worker";
import { createMediaProcessingWorker } from "@/workers/media-processing.worker";
import { createPropertyImportWorker } from "@/workers/property-import.worker";
import { createBillingSyncWorker } from "@/workers/billing.worker";
import { createEmailWorker } from "@/workers/email.worker";
import { createDlqWorker } from "@/workers/dlq.worker";
import { startDeliveryReconciler } from "@/lib/integrations/delivery-reconciler";

/**
 * Worker entrypoint — start every queue consumer in one process.
 *   npm run worker
 *
 * Each worker() returns the BullMQ Worker so graceful shutdown is trivial.
 */

async function main(): Promise<void> {
  // 02:00 America/Sao_Paulo daily dunning sweep (idempotent scheduler).
  try {
    await QueueManager.scheduleBillingDailyScan("billing-daily-scan", { hour: 2 });
  } catch (error) {
    console.warn("[workers] billing scheduler unavailable (Redis down?)", error);
  }

  const workers = [
    createLeadRoutingWorker(),
    createWebhookWorker(),
    createMediaProcessingWorker(),
    createPropertyImportWorker(),
    createBillingSyncWorker(),
    createEmailWorker(),
    createDlqWorker(QueueName.LEAD_ROUTING),
    createDlqWorker(QueueName.WEBHOOK_TRANSMISSION),
    createDlqWorker(QueueName.MEDIA_PROCESSING),
    createDlqWorker(QueueName.PROPERTY_IMPORT),
    createDlqWorker(QueueName.BILLING_SYNC),
    createDlqWorker(QueueName.EMAIL_SEND),
  ];

  // Zero-loss recovery: re-enqueue webhook deliveries that were persisted
  // PENDING but never got a queue job (Redis outage during enqueue).
  const deliveryReconciler = startDeliveryReconciler();

  console.info(`[workers] started ${workers.length} consumers (pid ${process.pid})`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[workers] ${signal} received — draining…`);
    clearInterval(deliveryReconciler);
    await Promise.all(workers.map((w) => w.close()));
    console.info("[workers] stopped cleanly.");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    console.error("[workers] unhandledRejection", reason);
  });
}

void main();