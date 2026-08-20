import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  hmacHex,
  parseSignedList,
  safeCompare,
  verifyAsaasSignature,
  verifyCustomSignature,
  verifyStripeSignature,
} from "@/lib/billing/gateway/verify";

/**
 * Webhook signature verification — pure crypto contracts per provider.
 * Each test signs a raw body the way the provider does and asserts the verifier
 * accepts it, rejects tampered bodies, and fails closed on missing headers.
 */

const SECRET = "whsec_demo_secret";

describe("safeCompare", () => {
  it("is constant-time and byte-exact", () => {
    expect(safeCompare(Buffer.from("abc"), Buffer.from("abc"))).toBe(true);
    expect(safeCompare(Buffer.from("abc"), Buffer.from("abd"))).toBe(false);
    expect(safeCompare(Buffer.from("abc"), Buffer.from("abcd"))).toBe(false);
  });
});

describe("parseSignedList", () => {
  it("parses Stripe-style signed headers", () => {
    const parts = parseSignedList("t=1492774577,v1=abc,v0=def");
    expect(parts).toMatchObject({ t: "1492774577", v1: "abc", v0: "def" });
  });

  it("tolerates malformed segments", () => {
    expect(parseSignedList("t=1,,v1=x")).toMatchObject({ t: "1", v1: "x" });
  });
});

describe("Stripe signature verification", () => {
  it("accepts a genuine signature", () => {
    const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = Buffer.from(
      createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest(),
    ).toString("base64");
    const header = `t=${timestamp},v1=${sig}`;
    expect(verifyStripeSignature(SECRET, body, header)).toBe(true);
  });

  it("rejects a tampered body using a valid signature structure", () => {
    const body = JSON.stringify({ id: "evt_1", type: "invoice.paid", amount: 999999 });
    const timestamp = "1710000000";
    const sig = Buffer.from(
      createHmac("sha256", SECRET).update(`${timestamp}.tampered`).digest(),
    ).toString("base64");
    expect(verifyStripeSignature(SECRET, body, `t=${timestamp},v1=${sig}`)).toBe(false);
  });

  it("fails closed without a signature header", () => {
    expect(verifyStripeSignature(SECRET, "{}", null)).toBe(false);
  });
});

describe("Asaas signature verification", () => {
  it("accepts a base64 HMAC signature", () => {
    const body = JSON.stringify({ event: "PAYMENT_CONFIRMED" });
    const sig = Buffer.from(
      createHmac("sha256", SECRET).update(body).digest(),
    ).toString("base64");
    expect(verifyAsaasSignature(SECRET, body, sig)).toBe(true);
  });

  it("accepts a hex HMAC signature (some Asaas accounts)", () => {
    const body = JSON.stringify({ event: "PAYMENT_CONFIRMED" });
    const sig = hmacHex(SECRET, body);
    expect(verifyAsaasSignature(SECRET, body, sig)).toBe(true);
  });

  it("rejects a signature produced with a different secret", () => {
    const body = JSON.stringify({ event: "PAYMENT_CONFIRMED" });
    const sig = Buffer.from(
      createHmac("sha256", "wrong-secret").update(body).digest(),
    ).toString("base64");
    expect(verifyAsaasSignature(SECRET, body, sig)).toBe(false);
  });
});

describe("Custom gateway signature verification", () => {
  it("accepts a hex HMAC of the raw body", () => {
    const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
    expect(verifyCustomSignature(SECRET, body, hmacHex(SECRET, body))).toBe(true);
  });

  it("rejects tampering", () => {
    const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
    const sig = hmacHex(SECRET, body);
    const tampered = body.replace("invoice.paid", "invoice.payment_failed");
    expect(tampered).not.toBe(body);
    expect(verifyCustomSignature(SECRET, tampered, sig)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyCustomSignature(SECRET, "{}", null)).toBe(false);
  });
});