import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisBull } from "@/lib/redis/client";
import { QueueName } from "@/lib/queues/names";
import type { EmailSendJobData } from "@/lib/queues/types";
import { getEmailTransport, NonRetryableEmailError } from "@/lib/email/transports";
import { attachWorkerObservability, isStandaloneEntry } from "@/workers/helpers";
import "../lib/events/register";

/**
 * email-send-queue worker.
 *
 * Renders nothing — the message arrives pre-rendered from the NotifyService —
 * and hands it to the active transport (Resend/SendGrid/SES/console).
 *
 * Retry policy: transient provider errors (429/5xx) are retried by BullMQ
 * (exponential backoff); permanent errors (bad key, invalid recipient) throw
 * NonRetryableEmailError so exhausted jobs park in `email-send-queue-dlq`.
 */

export function createEmailWorker(): Worker {
  const transport = getEmailTransport();
  const worker = new Worker<EmailSendJobData>(
    QueueName.EMAIL_SEND,
    async (job: Job<EmailSendJobData>) => {
      await transport.send({
        to: { email: job.data.toEmail, name: job.data.toName ?? undefined },
        subject: job.data.subject,
        html: job.data.html,
        text: job.data.text,
        dedupeKey: job.data.dedupeKey,
      });
    },
    {
      connection: redisBull,
      concurrency: 2,
    },
  );

  worker.on("failed", (job, err) => {
    if (err instanceof NonRetryableEmailError) {
      console.warn(
        `[worker:${QueueName.EMAIL_SEND}] permanent failure (no retry)`,
        { jobId: job?.id, message: err.message },
      );
    }
  });

  attachWorkerObservability(worker, QueueName.EMAIL_SEND);
  return worker;
}

// Allow direct execution: `tsx src/workers/email.worker.ts`
if (isStandaloneEntry("workers/email.worker.ts")) {
  const worker = createEmailWorker();
  console.info(`[worker:${QueueName.EMAIL_SEND}] started`);
  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}