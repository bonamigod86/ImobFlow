import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisBull } from "@/lib/redis/client";
import { QueueName } from "@/lib/queues/names";
import type { PropertyImportJobData } from "@/lib/queues/types";
import { ImportEngine } from "@/lib/imports/import-engine";
import { attachWorkerObservability, isStandaloneEntry } from "@/workers/helpers";
import "../lib/events/register";

/**
 * property-import-queue worker.
 *
 * Consumes an ImportBatch id and runs the upsert loop. The batch row holds the
 * parsed rows + per-row parse errors (written by the API route); this worker
 * only replays them through ImportEngine.runBatch. Any hard failure (DB down,
 * batch missing) throws and lets BullMQ's exponential backoff retry.
 */

async function runImport(job: Job<PropertyImportJobData>): Promise<{
  batchId: string;
  status: string;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}> {
  const { batchId } = job.data;
  await job.updateProgress(10);

  const result = await ImportEngine.runBatch(batchId);

  await job.updateProgress(100);
  return { batchId, ...result };
}

export function createPropertyImportWorker(): Worker {
  const worker = new Worker<PropertyImportJobData>(QueueName.PROPERTY_IMPORT, runImport, {
    connection: redisBull,
    concurrency: 2, // batch-level fan-out; keep concurrent batches bounded
  });
  attachWorkerObservability(worker, QueueName.PROPERTY_IMPORT);
  return worker;
}

if (isStandaloneEntry("workers/property-import.worker.ts")) {
  const worker = createPropertyImportWorker();
  console.info(`[worker:${QueueName.PROPERTY_IMPORT}] started`);

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}