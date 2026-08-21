import { NextRequest, NextResponse } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";
import { storage } from "@/lib/storage/storage";

/**
 * POST /api/tenant/profile/image?kind=logo|photo  (TENANT_UPDATE)
 * Uploads the tenant logo or the broker photo as raw image bytes, persists them
 * in the object store and points the DB field at the public URL. Keeps the
 * profile PATCH payload tiny (just the URL) — no giant base64 in JSON.
 *
 * GET  /api/tenant/profile/image?tenant=<id>&kind=logo|photo  (PUBLIC)
 * Serves the stored bytes (avatars are public on listings), same-origin.
 */

const MAX = 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const POST = withApiRoute(ACTIONS.TENANT_UPDATE, async (ctx, req) => {
  if (!ctx.tenantId) return fail(400, "NO_TENANT", "Sem tenant.");
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "logo" && kind !== "photo") return fail(400, "BAD_REQUEST", "Use kind=logo|photo.");

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX) return fail(413, "PAYLOAD_TOO_LARGE", "Imagem deve ter até 1 MB.");
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0) return fail(400, "BAD_REQUEST", "Corpo vazio.");

  const mime = (req.headers.get("content-type") ?? "image/jpeg").split(";")[0]!.trim();
  const ext = EXT[mime] ?? "jpg";
  const key = `tenants/${ctx.tenantId}/profile/${kind}.${ext}`;
  await storage.put(key, bytes, { contentType: mime });

  const url = `/api/tenant/profile/image?tenant=${encodeURIComponent(ctx.tenantId)}&kind=${kind}`;
  if (kind === "logo") {
    await prismaUnscoped.tenant.update({ where: { id: ctx.tenantId }, data: { logoUrl: url } });
  } else {
    await prismaUnscoped.user.update({ where: { id: ctx.userId }, data: { photoUrl: url } });
  }
  return ok({ url });
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenant = req.nextUrl.searchParams.get("tenant") ?? "";
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  if (!tenant || (kind !== "logo" && kind !== "photo")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const files = await listProfileFiles(tenant, kind);
  if (files.length === 0) return new NextResponse("Not found", { status: 404 });

  let buffer: Buffer;
  try {
    buffer = await storage.get(files[0]!);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  const mime = kind === "logo" ? "image/png" : "image/jpeg";
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}

async function listProfileFiles(tenant: string, kind: string): Promise<string[]> {
  // The local/disk store keeps the exact key; try the common extensions.
  const candidates = ["jpg", "png", "webp", "gif"].map(
    (ext) => `tenants/${tenant}/profile/${kind}.${ext}`,
  );
  const found: string[] = [];
  for (const key of candidates) {
    try {
      await storage.head(key);
      found.push(key);
    } catch {
      /* try next */
    }
  }
  return found;
}
