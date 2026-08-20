import type { NextRequest } from "next/server";
import { z } from "zod";
import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma/client";
import { createPasswordResetToken } from "@/lib/auth/reset-token";
import { notifyPasswordReset } from "@/lib/email/notify";
import { sanitizeEmail } from "@/lib/security/sanitize";
import { rateLimitByIp } from "@/lib/security/rate-limit";
import { extractIpAddress } from "@/lib/http/request-context";
import { mapError } from "@/lib/http/errors";
import { env } from "@/lib/config/env";
import "@/lib/events/register";

/**
 * POST /api/auth/forgot-password
 *
 * Public + rate-limited (per IP). Always returns 200 for existing emails so the
 * endpoint cannot be used to enumerate accounts. The reset e-mail carries a
 * single-use token (`/reset-password`, 15 min TTL).
 */

const forgotPasswordSchema = z.object({
  email: z.string().min(3).max(254),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await rateLimitByIp(
      "auth-forgot",
      extractIpAddress(req.headers),
      env.RATE_LIMIT_AUTH,
      env.RATE_LIMIT_WINDOW_SECONDS,
    );
  } catch (err) {
    return mapError(err);
  }

  const parsed = forgotPasswordSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "E-mail inválido." },
      { status: 400 },
    );
  }

  const email = sanitizeEmail(parsed.data.email);
  const user = email
    ? await prismaUnscoped.user.findUnique({ where: { email } })
    : null;

  if (user && user.isActive) {
    const raw = await createPasswordResetToken(user.id);
    const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(raw)}`;
    await notifyPasswordReset(
      user.id,
      {
        resetUrl,
        expiresInMinutes: Math.max(1, Math.round(env.RESET_TOKEN_TTL_SECONDS / 60)),
        appUrl: env.APP_URL,
      },
    );
  }

  // Uniform response regardless of whether the account exists.
  return NextResponse.json({ ok: true, message: "Se o e-mail existir, você receberá um link de redefinição." });
}