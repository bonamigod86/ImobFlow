import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared signature helpers for inbound payment-gateway webhooks.
 * Providers each receive the raw request body — signature verification MUST
 * happen over the exact bytes as transmitted (never a re-serialized body),
 * otherwise valid providers and fake attackers alike fail/leak.
 */

/** Constant-time comparison of two byte buffers with length-safe preprocessing. */
export function safeCompare(expected: Buffer, provided: Buffer): boolean {
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function hmac(secret: string, body: string | Buffer): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function hmacHex(secret: string, body: string | Buffer): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Parse a `t=...ts,v1=...sig[,v0=...]` Stripe-style signature header. */
export function parseSignedList(header: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq);
    const value = part.slice(eq + 1).trim();
    entries[key] = value;
  }
  return entries;
}

/**
 * Stripe: `v1` = base64(hmac-sha256(secret, "<timestamp>.<rawBody>")) and the
 * header carries the timestamp used to chain the signature. We verify using the
 * header-provided `t` so replays are still detectable downstream.
 */
export function verifyStripeSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const parts = parseSignedList(signatureHeader);
  const timestamp = parts.t;
  const candidate = parts.v1;
  if (!timestamp || !candidate) return false;

  const expected = hmac(secret, `${timestamp}.${rawBody}`);
  return safeCompare(expected, Buffer.from(candidate, "base64"));
}

/**
 * Asaas: the `asaas-signature` header carries a base64 HMAC-SHA256 of the raw
 * body keyed with the webhook token. Some accounts expose hex encoding — accept
 * either (both are timing-safe compared).
 */
export function verifyAsaasSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const expectedBase64 = hmac(secret, rawBody);
  const base64Match = safeCompare(expectedBase64, Buffer.from(signatureHeader, "base64"));
  if (base64Match) return true;

  const expectedHex = Buffer.from(hmacHex(secret, rawBody), "hex");
  return safeCompare(expectedHex, Buffer.from(signatureHeader, "hex"));
}

/**
 * Custom gateway: `x-webhook-signature` = hex HMAC-SHA256(secret, rawBody).
 * Mirrors the outbound webhook convention used by the Lead Engine so our own
 * partner endpoints can push billing events with the same signing pattern.
 */
export function verifyCustomSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const expected = Buffer.from(hmacHex(secret, rawBody), "hex");
  return safeCompare(expected, Buffer.from(signatureHeader, "hex"));
}