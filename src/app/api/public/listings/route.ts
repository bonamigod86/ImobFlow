import type { NextRequest } from "next/server";
import { ok, fail } from "@/lib/http/errors";
import { getPublicListingsByIds } from "@/lib/public/repository";

/**
 * GET /api/public/listings?ids=<id1>,<id2>,...
 * Public batch read for the visitor's favorites (works without an account).
 * Server-side visibility contract still applies: only ACTIVE listings from
 * ACTIVE tenants are ever returned.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length === 0) return ok({ items: [] });
  if (ids.length > 100) return fail(400, "VALIDATION_ERROR", "Limite de 100 imóveis por requisição.");

  try {
    const items = await getPublicListingsByIds(ids);
    return ok({ items });
  } catch {
    return fail(500, "INTERNAL_ERROR", "Não foi possível carregar os imóveis.");
  }
}