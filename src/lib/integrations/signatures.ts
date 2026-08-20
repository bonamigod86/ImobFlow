import { createHmac, createHash, timingSafeEqual } from "node:crypto";

/**
 * Outbound payload signatures (HMAC-SHA256).
 *
 * On every webhook transmission the worker attaches:
 *   X-Webhook-Timestamp  <unix-seconds>
 *   X-Webhook-Signature  sha256=<hex hmac over `ts.body`>
 *
 * The timestamp is bound into the signed payload so recipients can enforce a
 * freshness window (replay protection) while still verifying integrity — and a
 * fixed/idempotent key is NOT required for the signature to remain valid across
 * retries (the shared secret never rotates between attempts).
 */

export interface SignedWebhook {
  /** Headers to attach to the outbound request. */
  headers: Record<string, string>;
  /** The exact canonical body string that was signed. */
  body: string;
  /** Unix seconds captured at signing time. */
  timestamp: string;
  /** Hex HMAC digest (without the `sha256=` prefix). */
  signature: string;
}

/**
 * Sign a JSON payload. A UTC timestamp is generated when not provided.
 */
export function signWebhookPayload(
  secret: string,
  payload: unknown,
  timestampSeconds?: number,
): SignedWebhook {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const timestamp = String(timestampSeconds ?? Math.floor(Date.now() / 1000));
  const signature = hmacHex(secret, `${timestamp}.${body}`);
  return {
    headers: {
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature": `sha256=${signature}`,
      "content-type": "application/json",
    },
    body,
    timestamp,
    signature,
  };
}

/** Pure HMAC-SHA256 hex digest (testable, no I/O). */
export function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Verify an inbound-style signature without leaking timing on a mismatch.
 * Accepts both `sha256=hex` and bare-hex forms.
 */
export function verifySignature(
  secret: string,
  message: string,
  expected: string,
): boolean {
  const received = expected.replace(/^sha256=/i, "").toLowerCase();
  const computed = hmacHex(secret, message);
  if (received.length !== computed.length) return false;
  try {
    return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}

/**
 * Stable idempotency key stamped on every attempt of a delivery. Derived from
 * identity, not randomness, so BullMQ-forked retries reuse the same key and the
 * recipient CRM can collapse them into a single record.
 */
export function idempotencyKey(parts: { tenantId: string; leadId: string; endpointId: string }): string {
  const raw = [parts.tenantId, parts.leadId, parts.endpointId].join("|");
  return createHash("sha256").update(`lead-webhook:${raw}`).digest("hex");
}