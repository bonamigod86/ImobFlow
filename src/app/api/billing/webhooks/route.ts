import type { NextRequest } from "next/server";
import type { BillingProvider } from "@prisma/client";
import { ok, fail } from "@/lib/http/errors";
import {
  ingestProviderWebhook,
  PayloadParseError,
  SignatureVerificationError,
} from "@/lib/billing/billing-events";
import "@/lib/events/register";

/**
 * POST /api/billing/webhooks  — payment-provider webhook ingress (public).
 *
 * Authentication is signature-based (never a session). The provider is chosen
 * by the `?provider=` query param (used by gateways/users that cannot sign the
 * request themselves) and falls back to signature-header inspection.
 *
 * Idempotency + signature enforcement live in `ingestProviderWebhook`:
 *   - a verified body is normalized per provider then applied exactly once
 *     (unique `(provider, providerEventId)` ledger);
 *   - redeliveries are ack'd with 200 without re-applying side effects.
 */

const PROVIDER_BY_HEADER: Array<{ provider: BillingProvider; header: string }> = [
  { provider: "STRIPE", header: "stripe-signature" },
  { provider: "ASAAS", header: "asaas-signature" },
  { provider: "CUSTOM", header: "x-webhook-signature" },
];

function resolveProvider(req: NextRequest): BillingProvider | null {
  const query = req.nextUrl.searchParams.get("provider")?.toUpperCase();
  if (query === "STRIPE" || query === "ASAAS" || query === "CUSTOM") {
    return query;
  }
  const hit = PROVIDER_BY_HEADER.find((p) => req.headers.has(p.header));
  return hit?.provider ?? null;
}

export const POST = async (req: NextRequest) => {
  const provider = resolveProvider(req);
  if (!provider) {
    return fail(400, "UNKNOWN_PROVIDER", "Não foi possível identificar o provedor de pagamento.");
  }

  const rawBody = await req.text();
  if (!rawBody) {
    return fail(400, "EMPTY_BODY", "Corpo do webhook vazio.");
  }

  try {
    const result = await ingestProviderWebhook({ provider, rawBody, headers: req.headers });
    // Providers retry on anything but 2xx; duplicates are ack'd so retries
    // stop fast after the first successful application.
    return ok({ received: true, outcomes: result.outcomes });
  } catch (error) {
    if (error instanceof SignatureVerificationError) {
      return fail(401, "SIGNATURE_INVALID", "Assinatura do webhook inválida.");
    }
    if (error instanceof PayloadParseError) {
      return fail(400, "PAYLOAD_INVALID", "Payload do webhook inválido.");
    }
    console.error("[billing:webhooks] unhandled error", error);
    return fail(500, "INTERNAL", "Falha interna ao processar o webhook.");
  }
};

export const GET = async () =>
  fail(405, "METHOD_NOT_ALLOWED", "Use POST para enviar eventos de cobrança.");