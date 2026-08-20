import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { prismaUnscoped } from "@/lib/prisma/client";
import { extractIpAddress } from "@/lib/http/request-context";
import { ok, fail, mapError } from "@/lib/http/errors";
import { rateLimitByIp } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";
import "@/lib/events/register";

/**
 * POST /api/public/views
 * Public page-impression tracking for the portal PDP (item 4 — "visualizações").
 *
 * Body: { propertyId }.
 *
 * The listing must be publicly visible (ACTIVE tenant, ACTIVE/isActive property),
 * so a visit can only land on a subscriber that is advertising. The viewer is a
 * non-reversible SHA-1 of the request IP (plus the request id as salt) — never a
 * personal identifier. Rate-limited per IP, zero-loss fire-and-forget from the
 * portal page (the tracker does not block rendering).
 */
export async function POST(req: NextRequest) {
  try {
    await rateLimitByIp(
      "public-views",
      extractIpAddress(req.headers),
      env.RATE_LIMIT_PUBLIC_VIEWS,
      env.RATE_LIMIT_WINDOW_SECONDS,
    );
  } catch (err) {
    return mapError(err);
  }

  const body = (await req.json().catch(() => ({}))) as { propertyId?: unknown };
  const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
  if (!propertyId || propertyId.length > 64) {
    return fail(400, "VALIDATION_ERROR", "propertyId é obrigatório.");
  }

  try {
    const property = await prismaUnscoped.property.findFirst({
      where: {
        id: propertyId,
        isActive: true,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
      },
      select: { id: true, tenantId: true, slug: true },
    });
    if (!property) return fail(404, "NOT_FOUND", "Imóvel não encontrado.");

    const ip = extractIpAddress(req.headers);
    const viewer = `ip:${createHash("sha1").update(`${ip}:${randomUUID()}`).digest("hex").slice(0, 20)}`;

    await prismaUnscoped.propertyView.create({
      data: {
        tenantId: property.tenantId,
        propertyId: property.id,
        viewer,
        channel: "portal",
        pageUrl: `/imovel/${property.slug}`,
        userAgent: req.headers.get("user-agent"),
        ipAddress: ip,
      },
    });

    return ok({ recorded: true, propertyId }, 201);
  } catch (err) {
    return mapError(err);
  }
}