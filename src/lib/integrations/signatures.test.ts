import { describe, expect, it } from "vitest";
import {
  hmacHex,
  idempotencyKey,
  signWebhookPayload,
  verifySignature,
} from "@/lib/integrations/signatures";

describe("hmacHex", () => {
  it("is deterministic", () => {
    expect(hmacHex("secret", "body")).toBe(hmacHex("secret", "body"));
  });

  it("differs across secrets / messages", () => {
    expect(hmacHex("a", "m")).not.toBe(hmacHex("b", "m"));
    expect(hmacHex("a", "m")).not.toBe(hmacHex("a", "n"));
  });
});

describe("signWebhookPayload", () => {
  it("binds timestamp + body under the signature", () => {
    const signed = signWebhookPayload("s3cr3t", { hello: "world" }, 1_700_000_000);
    expect(signed.headers["x-webhook-signature"]).toMatch(/^sha256=/);
    expect(signed.headers["x-webhook-timestamp"]).toBe("1700000000");
    expect(signed.body).toContain("world");
    // Recomputed over `ts.body` must equal the header digest.
    expect(verifySignature("s3cr3t", `${signed.timestamp}.${signed.body}`, signed.signature)).toBe(true);
  });

  it("changes when the payload changes", () => {
    const a = signWebhookPayload("k", { x: 1 }, 100);
    const b = signWebhookPayload("k", { x: 2 }, 100);
    expect(a.signature).not.toBe(b.signature);
  });

  it("changes when the timestamp changes (replay protection)", () => {
    const a = signWebhookPayload("k", { x: 1 }, 100);
    const b = signWebhookPayload("k", { x: 1 }, 101);
    expect(a.signature).not.toBe(b.signature);
  });

  it("signs over the exact serialized body (recipient verifies the same bytes)", () => {
    const signed = signWebhookPayload("k", { a: 1, b: 2 }, 100);
    expect(signed.body).toBe(JSON.stringify({ a: 1, b: 2 }));
    expect(verifySignature("k", `${signed.timestamp}.${signed.body}`, signed.signature)).toBe(true);
  });
});

describe("verifySignature", () => {
  it("accepts the correct (optional sha256= prefix)", () => {
    expect(verifySignature("k", "message", hmacHex("k", "message"))).toBe(true);
    expect(verifySignature("k", "message", `sha256=${hmacHex("k", "message")}`)).toBe(true);
  });

  it("rejects wrong keys and wrong messages", () => {
    expect(verifySignature("k2", "message", hmacHex("k", "message"))).toBe(false);
    expect(verifySignature("k", "other", hmacHex("k", "message"))).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    expect(verifySignature("k", "message", "not-a-hex")).toBe(false);
    expect(verifySignature("k", "message", "")).toBe(false);
  });
});

describe("idempotencyKey", () => {
  it("is stable across calls for the same identity", () => {
    const parts = { tenantId: "t1", leadId: "l1", endpointId: "e1" };
    expect(idempotencyKey(parts)).toBe(idempotencyKey(parts));
  });

  it("differs when any identity component differs", () => {
    const base = { tenantId: "t1", leadId: "l1", endpointId: "e1" };
    expect(idempotencyKey({ ...base, endpointId: "e2" })).not.toBe(idempotencyKey(base));
    expect(idempotencyKey({ ...base, leadId: "l2" })).not.toBe(idempotencyKey(base));
    expect(idempotencyKey({ ...base, tenantId: "t2" })).not.toBe(idempotencyKey(base));
  });
});