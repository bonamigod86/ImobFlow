import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisBull } from "@/lib/redis/client";
import { QueueName } from "@/lib/queues/names";
import type { BillingSyncJobData } from "@/lib/queues/types";
import { runGlobalBillingScan } from "@/lib/billing/dunning";
import { expireDueHighlights } from "@/lib/billing/highlights";
import { attachWorkerObservability, isStandaloneEntry } from "@/workers/helpers";
import "../lib/events/register";

/**
 * billing-sync-queue worker.
 *
 * Consumes the (platform-level) dunning sweep every day:
 *   1. PRE_DUE reminders for renewing subscriptions;
 *   2. trial-end -> PAST_DUE promotion;
 *   3. grace-expiry automatic suspension (masked by the master switch);
 *   4. highlight window expiry.
 *
 * There is no tenant context for these jobs: billing is global, so every query
 * uses `prismaUnscoped` (inside dunning.ts / highlights.ts) with explicit
 * `tenantId` filtering.
 */

async function processBillingSync(job: Job<BillingSyncJobData>): Promise<{
  scan: Awaited<ReturnType<typeof runGlobalBillingScan>>;
  highlightsExpired: number;
}> {
  if (job.data.scope !== "global-scan") {
    throw new Error(`Unsupported billing sync scope: ${String(job.data)}`);
  }
  await job.updateProgress(10);
  const scan = await runGlobalBillingScan();
  await job.updateProgress(60);
  const highlightsExpired = await expireDueHighlights();
  await job.updateProgress(100);
  return { scan, highlightsExpired };
}

export function createBillingSyncWorker(): Worker {
  const worker = new Worker<BillingSyncJobData>(QueueName.BILLING_SYNC, processBillingSync, {
    connection: redisBull,
    concurrency: 1,
  });
  attachWorkerObservability(worker, QueueName.BILLING_SYNC);
  return worker;
}

// Allow direct execution: `tsx src/workers/billing.worker.ts`
if (isStandaloneEntry("workers/billing.worker.ts")) {
  const worker = createBillingSyncWorker();
  console.info(`[worker:${QueueName.BILLING_SYNC}] started`);
  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}