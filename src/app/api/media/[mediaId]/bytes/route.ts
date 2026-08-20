import { NextResponse } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";
import { storage } from "@/lib/storage/storage";
import { finalizeLocalMedia } from "@/lib/media/media-service";

/**
 * GET /api/media/[mediaId]/bytes  — serves the stored object (local fallback
 * renderer; real storage rows can also be rendered through here for a uniform
 * dashboard experience).
 *
 * POST /api/media/[mediaId]/bytes — local/dev store-and-finalize: the browser
 * sends raw bytes, the server persists them in the in-proc object store and
 * marks the PENDING row READY (no presigned host / worker needed).
 *
 * Both are tenant-scoped through the ambient Prisma extension.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.mediaId;
  return Array.isArray(id) ? id[0] : id;
}

const MAX_LOCAL_BYTES = 100 * 1024 * 1024;

export const GET = withApiRoute(ACTIONS.PROPERTIES_READ, async (_ctx, _req, params) => {
  const mediaId = normalizeId(params) as string;
  const media = await prisma.propertyMedia.findUnique({ where: { id: mediaId } });
  if (!media || !media.objectKey) return fail(404, "NOT_FOUND", "Media not found.");

  let buffer: Buffer;
  try {
    buffer = await storage.get(media.objectKey);
  } catch {
    return fail(404, "NOT_FOUND", "Stored object unavailable.");
  }

  // Follow S3-bodied rows through to their public/presigned URL when present.
  if (media.url && !media.url.startsWith("/api/media/")) {
    return NextResponse.redirect(media.url, 302);
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": media.mimeType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(buffer.length),
    },
  });
});

export const POST = withApiRoute(ACTIONS.PROPERTIES_UPDATE, async (ctx, req, params) => {
  const mediaId = normalizeId(params) as string;
  const media = await prisma.propertyMedia.findUnique({ where: { id: mediaId } });
  if (!media || !media.objectKey) return fail(404, "NOT_FOUND", "Media not found.");

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_LOCAL_BYTES) {
    return fail(413, "PAYLOAD_TOO_LARGE", "File is too large (max 100 MB).");
  }

  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) return fail(400, "VALIDATION_ERROR", "Empty payload.");

  await finalizeLocalMedia(mediaId, media.objectKey, bytes);

  return ok({ mediaId, ready: true });
});