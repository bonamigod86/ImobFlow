import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/config/env";

/**
 * At-rest encryption for outbound integration secrets (webhook HMAC secrets).
 *
 * Uses AES-256-GCM: authenticated encryption — any tampered secret fails
 * decryption loudly instead of producing a wrong, silently-signed payload.
 *
 * When `INTEGRATION_SECRET_KEY` is not configured we fall back to storing the
 * secret verbatim (dev convenience). In production the envelope format is:
 *   `v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>`
 */

const ENVELOPE_PREFIX = "v1";

/** Derive a 32-byte key from either a base64 (32 bytes) or hex (64 chars) value. */
function deriveKey(): Buffer {
  const raw = env.INTEGRATION_SECRET_KEY.trim();
  if (!raw) return Buffer.alloc(0);

  const buffered = Buffer.from(
    raw.startsWith("base64:") ? raw.slice("base64:".length) : raw,
    raw.startsWith("base64:") ? "base64" : "utf8",
  );

  // Prefer raw 32-byte keys; otherwise normalize any arbitrary secret into a
  // stable 32-byte key via SHA-256 (deterministic across processes).
  if (buffered.length === 32) return buffered;
  return createHash32(raw);
}

function createHash32(input: string): Buffer {
  // Deterministic digest — any environment reading the same secret derives the
  // same key without persisting a separate key value.
  return createHash("sha256").update(input).digest();
}

export function hasIntegrationSecretKey(): boolean {
  return env.INTEGRATION_SECRET_KEY.trim().length > 0;
}

/** Encrypt `plaintext`; returns the versioned envelope string (or the raw
 *  plaintext when no encryption key is configured). */
export function encryptSecret(plaintext: string): string {
  if (!hasIntegrationSecretKey()) return plaintext;

  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [ENVELOPE_PREFIX, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

/** Decrypt an envelope created by `encryptSecret`. Returns its argument when
 *  the value is not an envelope (dev plaintext fallback). */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(ENVELOPE_PREFIX)) return stored;
  if (!hasIntegrationSecretKey()) {
    // Envelope present but no key to open it: refuse silently-guessed secrets.
    throw new Error("INTEGRATION_SECRET_KEY is required to decrypt stored webhook secrets.");
  }

  const [, ivB64, tagB64, dataB64] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}