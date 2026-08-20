import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisBull } from "@/lib/redis/client";
import { QueueName } from "@/lib/queues/names";
import type { BillingSyncJobData } from "@/lib/queues/types";
import { runGlobalBillingScan } from "@/lib/billing/dunning";
import { runGlobalRenewalScan } from "@/lib/billing/renewals";
import { expireDueHighlights } from "@/lib/billing/highlights";
import { attachWorkerObservability, isStandaloneEntry } from "@/workers/helpers";
import "../lib/events/register";

/**
 * billing-sync-queue worker.
 *
 * Consumes the (platform-level) recurring/dunning sweep every day:
 *   1. renewal invoicing for ACTIVE subscriptions past their due date;
 *   2. PRE_DUE reminders, on-the-day DUE_REMINDERs, trial-end -> PENDING_DUE,
 *      overdue -> PAST_DUE promotion and LATE_REMINDER cadence;
 *   3. grace-expiry automatic suspension (masked by the master switch);
 *   4. highlight window expiry.
 *
 * There is no tenant context for these jobs: billing is global, so every query
 * uses `prismaUnscoped` (inside renewals.ts / dunning.ts / highlights.ts) with
 * explicit `tenantId` filtering.
 */

async function processBillingSync(job: Job<BillingSyncJobData>): Promise<{
  renewal: Awaited<ReturnType<typeof runGlobalRenewalScan>>;
  scan: Awaited<ReturnType<typeof runGlobalBillingScan>>;
  highlightsExpired: number;
}> {
  if (job.data.scope !== "global-scan") {
    throw new Error(`Unsupported billing sync scope: ${String(job.data)}`);
  }
  await job.updateProgress(10);
  const renewal = await runGlobalRenewalScan();
  await job.updateProgress(40);
  const scan = await runGlobalBillingScan();
  await job.updateProgress(70);
  const highlightsExpired = await expireDueHighlights();
  await job.updateProgress(100);
  return { renewal, scan, highlightsExpired };
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