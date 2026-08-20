import type { NextRequest } from "next/server";
import { publicFinancialLeadSchema } from "@/lib/validation/schemas";
import { captureFinancialLead } from "@/lib/leads/lead-service";
import { extractIpAddress } from "@/lib/http/request-context";
import { ok, fail, mapError } from "@/lib/http/errors";
import { rateLimitByIp } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";
import "@/lib/events/register";

/**
 * POST /api/public/financial-leads
 * Public intake for acquisition/financing requests (origin = SITE_FORM).
 *
 * A financial lead is scoped to a tenant by `propertyId` (derives the tenant
 * from the visible listing) or `tenantSlug`, then routed to the external
 * partner endpoint matched by the dynamic routing rules (tenant rules first,
 * then platform). When no rule matches the lead stays internal — never lost.
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

  const parsed = publicFinancialLeadSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(400, "VALIDATION_ERROR", first?.message ?? "Dados inválidos.");
  }
  const body = parsed.data;

  try {
    const result = await captureFinancialLead({
      name: body.name,
      email: body.email || null,
      phone: body.phone,
      message: body.message ?? null,
      interestType: body.interestType ?? null,
      propertyValue: body.propertyValue ?? null,
      downPayment: body.downPayment ?? null,
      financingAmount: body.financingAmount ?? null,
      monthlyIncome: body.monthlyIncome ?? null,
      monthlyInstallmentLimit: body.monthlyInstallmentLimit ?? null,
      termMonths: body.termMonths ?? null,
      city: body.city ?? null,
      state: body.state ?? null,
      propertyId: body.propertyId ?? null,
      tenantSlug: body.tenantSlug ?? null,
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
          rule: d.matchedRuleId,
          jobId: d.jobId,
        })),
      },
      201,
    );
  } catch (err) {
    return mapError(err);
  }
}