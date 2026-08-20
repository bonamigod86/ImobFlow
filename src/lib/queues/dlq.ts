import { Queue, type Job } from "bullmq";
import { redisBull } from "@/lib/redis/client";
import {
  dlqQueueName,
  QueueName,
  type QueueName as QueueNameType,
} from "@/lib/queues/names";
import { eventBus } from "@/lib/events/event-bus";
import "../events/register";

/**
 * Dead Letter Queue handling.
 *
 * When a job exhausts its retry budget (`attemptsMade >= attempts`) or hits a
 * known non-retryable error, `park` copies it — payload + failure metadata —
 * into `<queue>-dlq`. There the DLQ worker records it, and operations can
 * `replay` it back to the original queue (after fixing root cause) without
 * losing the original payload.
 */

export interface DlrJobMeta {
  originalQueue: QueueNameType;
  originalJobId: string;
  error: string;
  attemptsMade: number;
  parkedAt: string;
  data: unknown;
}

export class DeadLetterQueue {
  static queueFor(originalQueue: QueueNameType): Queue<DlrJobMeta> {
    return new Queue<DlrJobMeta>(dlqQueueName(originalQueue), {
      connection: redisBull,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 5000 },
        removeOnFail: { count: 2000 },
      },
    });
  }

  /** Move a failed job into the DLQ (idempotent per original jobId). */
  static async park(originalQueue: QueueNameType, job: Job, error: Error): Promise<void> {
    const dlq = this.queueFor(originalQueue);
    await dlq.add(
      "parked",
      {
        originalQueue,
        originalJobId: job.id ?? "",
        error: error.message,
        attemptsMade: job.attemptsMade,
        parkedAt: new Date().toISOString(),
        data: job.data,
      },
      { jobId: `dlq:${originalQueue}:${job.id ?? ""}` },
    );
  }

  /** Re-enqueue a parked job into its original queue under a fresh jobId. */
  static async replay(originalQueue: QueueNameType, dlqJobId: string): Promise<string | null> {
    const dlq = this.queueFor(originalQueue);
    const parked = await dlq.getJob(dlqJobId);
    if (!parked) return null;

    const meta = parked.data;
    const target = new Queue(meta.originalQueue, { connection: redisBull });
    const requeued = await target.add(
      `replayed:${meta.originalJobId}`,
      meta.data as object,
      { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
    );
    // Stamp the DLQ record so the ops console can see it was replayed.
    await (parked as unknown as { update: (d: Record<string, unknown>) => Promise<void> }).update({
      ...meta,
      replayedAt: new Date().toISOString(),
    });

    eventBus.emit("queue.job.replayed", {
      queueName: meta.originalQueue,
      dlqJobId,
      targetJobId: requeued.id ?? "",
    });

    return requeued.id ?? null;
  }

  /** Enumerate parked jobs (waiting + failed) with replay metadata. */
  static async list(
    originalQueue: QueueNameType,
  ): Promise<Array<{ jobId: string; meta: DlrJobMeta; replayedAt: string | null }>> {
    const dlq = this.queueFor(originalQueue);
    const jobs = await dlq.getJobs(["waiting", "delayed", "failed", "active", "completed"]);
    return jobs
      .filter((j) => j.data && typeof j.data === "object")
      .map((j) => {
        const meta = j.data as DlrJobMeta & { replayedAt?: string };
        return { jobId: j.id ?? "", meta, replayedAt: meta.replayedAt ?? null };
      })
      .sort((a, b) => (b.meta.parkedAt < a.meta.parkedAt ? -1 : 1));
  }
}

export { QueueName };