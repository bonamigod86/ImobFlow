import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import { redisBull } from "@/lib/redis/client";
import { QueueName, type QueueName as QueueNameType } from "@/lib/queues/names";
import type {
  BillingSyncJobData,
  EmailSendJobData,
  LeadRoutingJobData,
  MediaProcessingJobData,
  PropertyImportJobData,
  WebhookTransmissionJobData,
} from "@/lib/queues/types";
import "../events/register"; // ensure audit subscribers are wired

/**
 * QueueManager — single factory for BullMQ producers.
 *
 * Resilience policy (applies to every job added here):
 *   attempts: 5                       -> retry up to 5 times
 *   backoff: exponential, 2s base     -> 2s, 4s, 8s, 16s between attempts
 *   removeOnComplete / removeOnFail   -> bounded retention, no unbounded memory
 *
 * Producers can additionally pass a stable `jobId` — BullMQ ignores duplicate
 * jobIds still present in the queue, making re-enqueues idempotent.
 */

const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 } as const,
  removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
  removeOnFail: { count: 500, age: 30 * 24 * 3600 },
};

export class QueueManager {
  private static queues = new Map<QueueNameType, Queue<never>>();

  static get<T>(name: QueueNameType): Queue<T> {
    let queue = this.queues.get(name) as Queue<T> | undefined;
    if (!queue) {
      const created = new Queue<T>(name, {
        connection: redisBull,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(name, created as unknown as Queue<never>);
      queue = created;
    }
    return queue;
  }

  /** Enqueue a lead for asynchronous routing. Idempotent per lead. */
  static async addLeadRouting(data: LeadRoutingJobData): Promise<string> {
    const job = await this.get<LeadRoutingJobData>(QueueName.LEAD_ROUTING).add(
      "route-lead",
      data,
      { jobId: `lead-routing:${data.leadId}` },
    );
    return job.id ?? "";
  }

  /** Enqueue a webhook delivery. Idempotent per (integration, eventId). */
  static async addWebhookTransmission(
    data: WebhookTransmissionJobData,
  ): Promise<string> {
    const job = await this.get<WebhookTransmissionJobData>(
      QueueName.WEBHOOK_TRANSMISSION,
    ).add("transmit-webhook", data, {
      jobId: `webhook:${data.integrationId}:${data.eventId}`,
    });
    return job.id ?? "";
  }

  /** Enqueue media transformation. Idempotent per media row. */
  static async addMediaProcessing(data: MediaProcessingJobData): Promise<string> {
    const job = await this.get<MediaProcessingJobData>(QueueName.MEDIA_PROCESSING).add(
      "process-media",
      data,
      { jobId: `media:${data.mediaId}` },
    );
    return job.id ?? "";
  }

  /** Enqueue a property-import batch. Idempotent per batch. */
  static async addPropertyImport(data: PropertyImportJobData): Promise<string> {
    const job = await this.get<PropertyImportJobData>(QueueName.PROPERTY_IMPORT).add(
      "run-import",
      data,
      { jobId: `import:${data.batchId}` },
    );
    return job.id ?? "";
  }

  /** Enqueue the global billing dunning sweep. Idempotent per run key. */
  static async addBillingSync(data: BillingSyncJobData, jobId?: string): Promise<string> {
    const job = await this.get<BillingSyncJobData>(QueueName.BILLING_SYNC).add(
      "billing-scan",
      data,
      jobId ? { jobId } : undefined,
    );
    return job.id ?? "";
  }

  /** Register the daily recurring dunning schedule (idempotent scheduler). */
  static async scheduleBillingDailyScan(schedulerId: string, timeRange: {
    hour: number;
    minute?: number;
    tz?: string;
  }): Promise<void> {
    const queue = this.get<BillingSyncJobData>(QueueName.BILLING_SYNC);
    const { hour, minute = 0, tz = "America/Sao_Paulo" } = timeRange;
    await queue.upsertJobScheduler(
      schedulerId,
      { pattern: `${minute} ${hour} * * *`, tz },
      { name: "billing-scan", data: { scope: "global-scan" } },
    );
  }

  /**
   * Enqueue a rendered transactional e-mail. Idempotent: the renderer's stable
   * `dedupeKey` is hashed into a BullMQ-safe jobId, so re-dispatches of the
   * same message are no-ops while the job is still in the queue. (Raw keys
   * contain `:` and long payloads, which BullMQ rejects as custom IDs.)
   */
  static async addEmailSend(data: EmailSendJobData): Promise<string> {
    const jobId = createHash("sha256").update(data.dedupeKey).digest("hex");
    const job = await this.get<EmailSendJobData>(QueueName.EMAIL_SEND).add(
      "send-email",
      data,
      {
        jobId,
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
      },
    );
    return job.id ?? "";
  }
}