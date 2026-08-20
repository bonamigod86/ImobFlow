import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken, SESSION_COOKIE } from "@/lib/auth/jwt";
import { hashPassword, verifyPassword, isPasswordLengthAllowed } from "@/lib/auth/password";
import { parseDurationToSeconds } from "@/lib/config/env";
import type { SessionToken } from "@/lib/auth/jwt";

describe("JWT session round-trip", () => {
  const payload: SessionToken = {
    userId: "usr_123",
    tenantId: "ten_abc",
    tenantSlug: "acme",
    role: "AGENT",
    email: "agent@acme.com",
    name: "Agent Test",
  };

  it("signs and verifies a token", async () => {
    const token = await signSessionToken(payload);
    const verified = await verifySessionToken(token);
    expect(verified).toMatchObject({
      userId: "usr_123",
      tenantId: "ten_abc",
      tenantSlug: "acme",
      role: "AGENT",
      email: "agent@acme.com",
      name: "Agent Test",
    });
  });

  it("rejects garbage / tampered tokens", async () => {
    expect(await verifySessionToken("not-a-jwt")).toBeNull();

    const token = await signSessionToken(payload);
    const parts = token.split(".");
    const header = parts[0]!;
    const body = parts[1]!;
    const sig = parts[2]!;
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.role = "MASTER"; // privilege escalation attempt
    const forgedBody = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    expect(await verifySessionToken(`${header}.${forgedBody}.${sig}`)).toBeNull();
  });

  it("SESSION_COOKIE default is stable", () => {
    expect(SESSION_COOKIE).toBe("saas_session_test");
  });
});

describe("password hashing", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("S3cret-Pass!12");
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(await verifyPassword("S3cret-Pass!12", hash)).toBe(true);
    expect(await verifyPassword("wrong-pass", hash)).toBe(false);
  });

  it("bounds password length (bcrypt 72-byte limit)", () => {
    expect(isPasswordLengthAllowed("12345678")).toBe(true);
    expect(isPasswordLengthAllowed("1234567")).toBe(false);
    expect(isPasswordLengthAllowed("x".repeat(72))).toBe(true);
    expect(isPasswordLengthAllowed("x".repeat(73))).toBe(false);
  });
});

describe("env duration parsing", () => {
  it("parses unit suffixes and plain seconds", () => {
    expect(parseDurationToSeconds("300")).toBe(300);
    expect(parseDurationToSeconds("5m")).toBe(300);
    expect(parseDurationToSeconds("8h")).toBe(28800);
    expect(parseDurationToSeconds("7d")).toBe(604800);
  });

  it("rejects malformed durations", () => {
    expect(() => parseDurationToSeconds("1y")).toThrow();
    expect(() => parseDurationToSeconds("")).toThrow();
  });
});