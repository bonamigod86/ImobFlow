import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisBull } from "@/lib/redis/client";
import { dlqQueueName, QueueName, type QueueName as QueueNameType } from "@/lib/queues/names";
import type { DlrJobMeta } from "@/lib/queues/dlq";
import "../lib/events/register";

/**
 * DLQ worker for a given main queue.
 *
 * Consumes parked jobs, logs them in a structured way (future: persist to a
 * `DeadLetter` table for the ops console) and never auto-replays — replay is
 * an explicit, audited operation (POST /api/jobs/[id]/replay).
 */

async function processDlq(job: Job<DlrJobMeta>): Promise<{ recorded: true }> {
  const meta = job.data;
  console.warn("[dlq] parked job", {
    dlqJobId: job.id,
    originalQueue: meta.originalQueue,
    originalJobId: meta.originalJobId,
    attemptsMade: meta.attemptsMade,
    error: meta.error,
    parkedAt: meta.parkedAt,
  });
  return { recorded: true };
}

export function createDlqWorker(originalQueue: QueueNameType): Worker {
  const worker = new Worker<DlrJobMeta>(dlqQueueName(originalQueue), processDlq, {
    connection: redisBull,
    concurrency: 2,
  });

  worker.on("completed", (job) => {
    console.info(`[dlq:${originalQueue}] recorded`, { jobId: job.id });
  });
  worker.on("failed", (job, err) => {
    console.error(`[dlq:${originalQueue}] processing failed`, { jobId: job?.id, err: err.message });
  });
  worker.on("error", (err) => console.error(`[dlq:${originalQueue}] error`, err));

  return worker;
}

export { QueueName };