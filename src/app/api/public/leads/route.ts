import type { NextRequest } from "next/server";
import { publicRealEstateLeadSchema } from "@/lib/validation/schemas";
import { captureRealEstateLead } from "@/lib/leads/lead-service";
import { extractIpAddress } from "@/lib/http/request-context";
import { ok, fail, mapError } from "@/lib/http/errors";
import { rateLimitByIp } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";
import "@/lib/events/register";

/**
 * POST /api/public/leads
 * Public lead intake from the portal PDP (origin = SITE_FORM).
 *
 * CROSS-TENANT route backed by the lead engine: the listing resolves the
 * owning tenant (any ACTIVE tenant), consent is persisted (LGPD), the lead
 * lands on that tenant's dashboard and is dispatched to the tenant/platform
 * REAL_ESTATE webhook endpoints. Privacy metadata (IP, UA, referer) is stamped
 * server-side — never trusted from the body.
 */

export async function POST(req: NextRequest) {
  try {
    await rateLimitByIp(
      "public-leads",
      extractIpAddress(req.headers),
      env.RATE_LIMIT_PUBLIC_LEADS,
      env.RATE_LIMIT_WINDOW_SECONDS,
    );
  } catch (err) {
    return mapError(err);
  }

  const parsed = publicRealEstateLeadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(400, "VALIDATION_ERROR", first?.message ?? "Dados inválidos.");
  }
  const body = parsed.data;

  try {
    const result = await captureRealEstateLead({
      propertyId: body.propertyId,
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      message: body.message ?? null,
      schedule: body.schedule ?? null,
      utm: body.utm,
      consentTextVersion: body.consent.textVersion,
      client: {
        ipAddress: extractIpAddress(req.headers),
        userAgent: req.headers.get("user-agent"),
        originUrl: req.headers.get("referer"),
      },
    });

    return ok(
      {
        lead: { id: result.leadId, type: result.type, status: "NEW" },
        routing: result.routing,
        deliveries: result.deliveries.map((d) => ({
          id: d.deliveryId,
          endpoint: d.endpointName,
          jobId: d.jobId,
        })),
      },
      201,
    );
  } catch (err) {
    return mapError(err);
  }
}