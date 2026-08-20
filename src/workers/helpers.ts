import type { Job, Worker } from "bullmq";
import { DeadLetterQueue } from "@/lib/queues/dlq";
import type { QueueName } from "@/lib/queues/names";
import { eventBus } from "@/lib/events/event-bus";

/**
 * Shared worker helpers: error classification and the "failed" hook that
 * parks exhausted jobs into the DLQ and reports them on the event bus.
 */

/** Error that should NOT be retried (transient retries are pointless). */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableError";
  }
}

export function isNonRetryable(err: unknown): boolean {
  return err instanceof NonRetryableError;
}

/**
 * BullMQ fires "failed" after EVERY failed attempt, including exhausted ones.
 * Park into the DLQ only when the retry budget is spent (or the error is
 * non-retryable — then the processor already parked via moveToFailed once).
 */
export async function onJobFailed(
  queueName: QueueName,
  job: Job | undefined,
  err: Error,
): Promise<void> {
  const attempts = job?.opts.attempts ?? 1;
  const exhausted = !!job && job.attemptsMade >= attempts;

  if (job && exhausted) {
    // The webhook processor handles non-retryable errors itself (moveToFailed);
    // here we only park genuinely exhausted jobs.
    await DeadLetterQueue.park(queueName, job, err).catch((e) =>
      console.error("[dlq] park failed", e),
    );
  }

  eventBus.emit("queue.job.failed", {
    queueName,
    jobId: job?.id ?? "unknown",
    error: err.message,
    attemptsMade: job?.attemptsMade ?? 0,
  });
}

/** Wire standard lifecycle logging onto a worker. */
export function attachWorkerObservability(
  worker: Worker,
  queueName: QueueName,
): void {
  worker.on("completed", (job) => {
    console.info(`[worker:${queueName}] completed`, { jobId: job.id });
  });
  worker.on("failed", (job, err) => {
    void onJobFailed(queueName, job ?? undefined, err);
  });
  worker.on("error", (err) => {
    console.error(`[worker:${queueName}] error`, err);
  });
}

/**
 * Detect whether this module was launched directly (tsx src/workers/x.ts)
 * rather than imported by another entrypoint (workers/index.ts, vitest).
 * Portable across CJS (`require.main`) and ESM (`argv[1]`) runtimes.
 */
export function isStandaloneEntry(fileName: string): boolean {
  const entry = process.argv[1];
  return typeof entry === "string" && entry.replace(/\\/g, "/").endsWith(fileName);
}