import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { storage, publicUrlForKey, hasRealStorage } from "@/lib/storage/storage";
import { QueueManager } from "@/lib/queues/queue-manager";
import { requireTenantId } from "@/lib/tenant/context";

/**
 * MediaService — orchestrates the gallery lifecycle.
 *
 * Upload flow:
 *   1. `registerUpload` creates the PropertyMedia row (PENDING) and returns a
 *      presigned PUT URL + the storage key. The client streams bytes straight
 *      to object storage — nothing large sits in app memory.
 *   2. The row state machine flips PENDING -> PROCESSING via a BullMQ job that
 *      runs the offline WebP/thumbnail pipeline and re-writes variants.
 *   3. `finalize` (worker) marks READY and exposes public URLs.
 *
 * All reads/writes are tenant-scoped via the ambient Prisma extension.
 */

const EXPIRES_DEFAULT_S = 900;

export async function registerUpload(input: {
  propertyId: string;
  kind?: "IMAGE" | "VIDEO";
  mimeType?: string;
  sizeBytes?: number;
}): Promise<{ mediaId: string; uploadUrl: string; objectKey: string }> {
  const tenantId = requireTenantId();
  const extension = mimeToExtension(input.mimeType ?? "image/jpeg");
  const objectKey = `tenants/${tenantId}/properties/${input.propertyId}/${crypto.randomUUID()}.${extension}`;
  // Object key is derived after tenant resolution; the row owns storage.
  const media = await prisma.propertyMedia.create({
    data: {
      objectKey,
      propertyId: input.propertyId,
      kind: input.kind ?? "IMAGE",
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      status: "PENDING",
    } as Prisma.PropertyMediaUncheckedCreateInput,
  });

  const uploadUrl = await storage.presignPut(objectKey, {
    contentType: input.mimeType ?? "image/jpeg",
    expiresInSeconds: EXPIRES_DEFAULT_S,
  });

  // Real object storage: the client streams bytes to the presigned URL and the
  // processing queue validates/transcodes asynchronously. Local fallback has no
  // shared object store and no presigned host, so no job is enqueued — the
  // server-side bytes route stores and finalizes the row synchronously instead.
  if (hasRealStorage) {
    await QueueManager.addMediaProcessing({
      tenantId,
      mediaId: media.id,
      propertyId: input.propertyId,
      sourceKey: objectKey,
    });
  }

  return { mediaId: media.id, uploadUrl, objectKey };
}

/**
 * Local/dev friendly finalize: stores the raw bytes server-side and marks the
 * row READY with an in-app URL, bypassing the offline transcoding pipeline
 * (which needs a real object store + worker process).
 */
export async function finalizeLocalMedia(mediaId: string, objectKey: string, bytes: Buffer): Promise<void> {
  await storage.put(objectKey, bytes);
  await prisma.propertyMedia.update({
    where: { id: mediaId },
    data: {
      status: "READY",
      url: `/api/media/${mediaId}/bytes`,
      sizeBytes: bytes.length,
    },
  });
}

/** Reorder the gallery (array of media ids in desired display order). */
export async function reorderGallery(propertyId: string, orderedIds: string[]): Promise<void> {
  const batch = orderedIds.map((id, idx) =>
    prisma.propertyMedia.update({
      where: { id },
      data: { sortOrder: idx },
    }),
  );
  await prisma.$transaction(batch);
  // Sanity: rows that belong to this property but were omitted sink to the end.
  await prisma.propertyMedia.updateMany({
    where: { propertyId, id: { notIn: orderedIds } },
    data: { sortOrder: orderedIds.length + 1 },
  });
}

/** Promote one image to the gallery cover; demote the previous primary. */
export async function setPrimaryMedia(propertyId: string, mediaId: string): Promise<void> {
  await prisma.$transaction([
    // Ignore the previously primary for this property (non-scoped update via
    // updateMany keeps the extension's tenant filter).
    prisma.propertyMedia.updateMany({
      where: { propertyId },
      data: { isPrimary: false },
    }),
    prisma.propertyMedia.update({
      where: { id: mediaId },
      data: { isPrimary: true },
    }),
  ]);
}

/** Remove a media row and delete its stored objects (original + variants). */
export async function deleteMedia(mediaId: string): Promise<void> {
  const media = await prisma.propertyMedia.findUnique({ where: { id: mediaId } });
  if (!media) return;
  if (media.objectKey) await storage.delete(media.objectKey);
  const variants: Record<string, string> | null = media.variants as Record<string, string> | null;
  if (variants) {
    await Promise.all(Object.values(variants).map((key) => storage.delete(key)));
  }
  await prisma.propertyMedia.delete({ where: { id: mediaId } });
}

/** Public URL override — tenant-custom domain, else presigned. */
export async function resolveMediaUrl(media: {
  variant?: string;
  objectKey?: string | null;
  variants?: Prisma.JsonValue | null;
  url?: string | null;
}): Promise<string> {
  if (media.url) return media.url;
  const key = media.variant && media.variants ? (media.variants as Record<string, string>)[media.variant] : media.objectKey;
  if (!key) return "";
  const publicUrl = publicUrlForKey(key);
  if (publicUrl) return publicUrl;
  return storage.presignGet(key, { expiresInSeconds: 3600 });
}

function mimeToExtension(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/avif") return "avif";
  if (mime.startsWith("video/")) return "mp4";
  return "jpg";
}