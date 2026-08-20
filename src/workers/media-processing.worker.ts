import "dotenv/config";
import { Worker, type Job } from "bullmq";
import type { MediaStatus } from "@prisma/client";
import { redisBull } from "@/lib/redis/client";
import { QueueName } from "@/lib/queues/names";
import type { MediaProcessingJobData } from "@/lib/queues/types";
import { withTenantContext } from "@/lib/tenant/context";
import { NonRetryableError, attachWorkerObservability, isStandaloneEntry } from "@/workers/helpers";
import { storage } from "@/lib/storage/storage";
import { processImage, type VariantSpec } from "@/lib/media/image";
import { prisma } from "@/lib/prisma/client";

/**
 * media-processing-queue worker.
 *
 * Resilient pipeline for uploaded images:
 *   1. Fetch the source object from object storage.
 *   2. Transcode to WebP + the 3 standard variants (thumbnail/medium/large),
 *      optionally compositing a watermark.
 *   3. Store each variant back to object storage (suffixed object keys).
 *   4. Flip the PropertyMedia row PROCESSING -> READY with variant metadata.
 *
 * Non-image input -> permanent failure (moveToFailed -> DLQ). Transient storage
 * errors bubble up so BullMQ's exponential backoff retries them.
 */

const VARIANT_LABELS = ["thumbnail", "medium", "large"] as const;

function variantKey(sourceKey: string, label: string): string {
  const dot = sourceKey.lastIndexOf(".");
  const base = dot === -1 ? sourceKey : sourceKey.slice(0, dot);
  return `${base}.${label}.webp`;
}

async function processMedia(job: Job<MediaProcessingJobData>): Promise<{ status: MediaStatus; variantKeys: string[] }> {
  const { tenantId, mediaId, propertyId, sourceKey, sizes, watermarkKey } = job.data;

  return withTenantContext(
    { tenantId, tenantSlug: null, userId: null, role: null },
    async () => {
      // Flag row as PROCESSING before doing any work (idempotent re-runs).
      await prisma.propertyMedia.update({
        where: { id: mediaId },
        data: { status: "PROCESSING" },
      });
      await job.updateProgress(15);

      let source: Buffer;
      let head: { size: number; contentType?: string };
      try {
        source = await storage.get(sourceKey);
        head = await storage.head(sourceKey);
      } catch (err) {
        return failPermanent(job, mediaId, `Source object unavailable (${sourceKey}: ${(err as Error).message})`);
      }

      let processed;
      try {
        processed = await processImage(source, {
          variants: (sizes as VariantSpec[] | undefined) ?? undefined,
        });
      } catch (err) {
        // Unreadable/malformed image -> permanent failure, never retry.
        return failPermanent(job, mediaId, `Unprocessable image (${sourceKey}: ${(err as Error).message})`);
      }
      await job.updateProgress(55);

      const variants: Record<string, string> = {};
      for (const out of processed.variants) {
        const key = variantKey(sourceKey, out.label);
        await storage.put(key, out.buffer, { contentType: "image/webp" });
        variants[out.label] = key;
      }

      if (watermarkKey) {
        const wm = await storage.get(watermarkKey);
        // Re-process with watermark when configured (job-level watermark).
        const withMark = await processImage(source, { watermark: wm });
        for (const out of withMark.variants) {
          const key = variantKey(sourceKey, `${out.label}-wm`);
          await storage.put(key, out.buffer, { contentType: "image/webp" });
          variants[`${out.label}-wm`] = key;
        }
      }

      // Guard: ensure every standard label exists (fall back to '').
      const keys: Record<string, string> = {};
      for (const label of VARIANT_LABELS) keys[label] = variants[label] ?? "";

      const finalize = await prisma.propertyMedia.update({
        where: { id: mediaId },
        data: {
          status: "READY",
          variants: keys,
          width: processed.width || null,
          height: processed.height || null,
          sizeBytes: head.size ?? null,
        },
      });

      await job.updateProgress(100);
      return { status: finalize.status, variantKeys: Object.values(keys) };
    },
  );
}

async function failPermanent(
  job: Job<MediaProcessingJobData>,
  mediaId: string,
  message: string,
): Promise<{ status: MediaStatus; variantKeys: string[] }> {
  // Mark the row failed and finalize the BullMQ attempt immediately
  // (non-retryable -> moves to the DLQ watcher for inspection).
  await prisma.propertyMedia
    .update({ where: { id: mediaId }, data: { status: "FAILED" } })
    .catch(() => undefined);
  const err = new NonRetryableError(message);
  await job.moveToFailed(err, job.id ?? "", true).catch(() => undefined);
  return { status: "FAILED", variantKeys: [] };
}

export function createMediaProcessingWorker(): Worker {
  const worker = new Worker<MediaProcessingJobData>(
    QueueName.MEDIA_PROCESSING,
    processMedia,
    { connection: redisBull, concurrency: 4 },
  );
  attachWorkerObservability(worker, QueueName.MEDIA_PROCESSING);
  return worker;
}

if (isStandaloneEntry("workers/media-processing.worker.ts")) {
  const worker = createMediaProcessingWorker();
  console.info(`[worker:${QueueName.MEDIA_PROCESSING}] started`);

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}