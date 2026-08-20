import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * At-rest secret encryption (AES-256-GCM).
 * The module reads `INTEGRATION_SECRET_KEY` at load time, so the encrypted-path
 * tests reload the module with the key injected, then restore the dev default.
 */

async function loadSecrets() {
  vi.resetModules();
  return import("@/lib/crypto/secrets");
}

async function restoreDev() {
  process.env.INTEGRATION_SECRET_KEY = "";
  vi.resetModules();
  await import("@/lib/crypto/secrets");
}

afterEach(async () => {
  await restoreDev();
});

describe("secrets at-rest encryption", () => {
  it("stores plaintext when no INTEGRATION_SECRET_KEY is set (dev)", async () => {
    const mod = await loadSecrets();
    expect(mod.hasIntegrationSecretKey()).toBe(false);
    const stored = mod.encryptSecret("dev-secret");
    expect(stored).toBe("dev-secret");
    expect(mod.decryptSecret(stored)).toBe("dev-secret");
    expect(mod.decryptSecret("plain")).toBe("plain");
  });

  it("encrypts/decrypts with AES-256-GCM when a key is configured", async () => {
    process.env.INTEGRATION_SECRET_KEY = `base64:${Buffer.alloc(32, 0x41).toString("base64")}`;
    const mod = await loadSecrets();
    expect(mod.hasIntegrationSecretKey()).toBe(true);

    const wrapped = mod.encryptSecret("super-secret");
    expect(wrapped.startsWith("v1:")).toBe(true);
    expect(wrapped).not.toContain("super-secret");
    expect(mod.decryptSecret(wrapped)).toBe("super-secret");
  });

  it("is deterministic-compatible across module reloads with the same key", async () => {
    process.env.INTEGRATION_SECRET_KEY = `base64:${Buffer.alloc(32, 0x42).toString("base64")}`;
    const modA = await loadSecrets();
    const wrapped = modA.encryptSecret("stable");
    const modB = await loadSecrets();
    expect(modB.decryptSecret(wrapped)).toBe("stable");
  });

  it("rejects tampered ciphertext (GCM authentication)", async () => {
    process.env.INTEGRATION_SECRET_KEY = `base64:${Buffer.alloc(32, 0x09).toString("base64")}`;
    const mod = await loadSecrets();
    const wrapped = mod.encryptSecret("secret");

    const parts = wrapped.split(":");
    const cipher = Buffer.from(parts[3]!, "base64");
    cipher[0] = (cipher[0] ?? 0) ^ 0xff;
    parts[3] = cipher.toString("base64");

    expect(() => mod.decryptSecret(parts.join(":"))).toThrow();
  });

  it("refuses to decrypt an envelope without a configured key", async () => {
    process.env.INTEGRATION_SECRET_KEY = `base64:${Buffer.alloc(32, 0x03).toString("base64")}`;
    const modA = await loadSecrets();
    const wrapped = modA.encryptSecret("cant-open");

    process.env.INTEGRATION_SECRET_KEY = "";
    const modB = await loadSecrets();
    expect(() => modB.decryptSecret(wrapped)).toThrow(/INTEGRATION_SECRET_KEY/);
  });
});