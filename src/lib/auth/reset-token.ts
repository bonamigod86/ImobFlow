import { createHash, randomBytes } from "node:crypto";
import { prismaUnscoped } from "@/lib/prisma/client";
import { env } from "@/lib/config/env";

/**
 * Single-use password-reset tokens (Phase 6).
 *
 * The raw token is a 256-bit CSPRNG value sent to the user by e-mail; only its
 * SHA-256 digest is stored. Redemption is strictly one-time (`consumed` updates
 * `usedAt` below the unique `tokenHash`), and expiry is enforced at read time.
 */

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Generate a new token for a user, returning the RAW value (mail-only). */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + env.RESET_TOKEN_TTL_SECONDS * 1000,
  );
  await prismaUnscoped.passwordResetToken.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });
  await prismaUnscoped.passwordResetToken.create({
    data: { userId, tokenHash: sha256(raw), expiresAt },
  });
  return raw;
}

/** Resolve + validate a token; returns the token row or null. */
export async function findValidPasswordResetToken(
  rawToken: string,
): Promise<{ id: string; userId: string } | null> {
  const row = await prismaUnscoped.passwordResetToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
  });
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt < new Date()) return null;
  return { id: row.id, userId: row.userId };
}

/** Atomically consume a token (single use). Returns true when redeemed. */
export async function consumePasswordResetToken(tokenId: string): Promise<boolean> {
  const result = await prismaUnscoped.passwordResetToken.updateMany({
    where: { id: tokenId, usedAt: null },
    data: { usedAt: new Date() },
  });
  return result.count === 1;
}