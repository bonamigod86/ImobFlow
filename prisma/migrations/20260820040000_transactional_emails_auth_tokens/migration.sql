-- =============================================================================
-- Phase 6 — Transactional emails, auth hardening & handover
-- Adds the single-use password-reset token store used by the auth flow.
-- Tokens are stored as SHA-256 digests (the raw value lives only in the e-mail
-- link), expire, and are redeemed exactly once (usedAt).
-- =============================================================================

CREATE TABLE "PasswordResetToken" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- One raw token per row (digest collision would be catastrophic).
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- Tokens never outlive their user (hard delete => cascade).
ALTER TABLE "PasswordResetToken"
    ADD CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
