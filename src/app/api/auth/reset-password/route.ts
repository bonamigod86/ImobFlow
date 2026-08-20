import type { NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prismaUnscoped } from "@/lib/prisma/client";
import {
  consumePasswordResetToken,
  findValidPasswordResetToken,
} from "@/lib/auth/reset-token";
import {
  hashPassword,
  isPasswordLengthAllowed,
} from "@/lib/auth/password";
import { eventBus } from "@/lib/events/event-bus";
import { extractIpAddress } from "@/lib/http/request-context";
import { mapError } from "@/lib/http/errors";
import { rateLimitByIp } from "@/lib/security/rate-limit";
import { env } from "@/lib/config/env";
import "@/lib/events/register";

/**
 * POST /api/auth/reset-password
 *
 * Public + rate-limited. Validates the single-use token (hash-compare, expiry,
 * atomic consumption), then rotates the password. If the account was inactive
 * it is reactivated and a `user.activated` event fires (activation e-mail).
 */

const resetPasswordSchema = z.object({
  token: z.string().min(10).max(500),
  password: z.string().min(8).max(72),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await rateLimitByIp(
      "auth-reset",
      extractIpAddress(req.headers),
      env.RATE_LIMIT_AUTH,
      env.RATE_LIMIT_WINDOW_SECONDS,
    );
  } catch (err) {
    return mapError(err);
  }

  const parsed = resetPasswordSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "Token ou senha inválidos." },
      { status: 400 },
    );
  }
  const { token, password } = parsed.data;

  if (!isPasswordLengthAllowed(password)) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", message: "A senha deve ter entre 8 e 72 caracteres." },
      { status: 400 },
    );
  }

  const found = await findValidPasswordResetToken(token);
  if (!found) {
    return NextResponse.json(
      { error: "INVALID_TOKEN", message: "Link inválido, expirado ou já utilizado." },
      { status: 400 },
    );
  }

  const consumed = await consumePasswordResetToken(found.id);
  if (!consumed) {
    return NextResponse.json(
      { error: "INVALID_TOKEN", message: "Link inválido, expirado ou já utilizado." },
      { status: 400 },
    );
  }

  const user = await prismaUnscoped.user.findUnique({ where: { id: found.userId } });
  if (!user) {
    return NextResponse.json(
      { error: "INVALID_TOKEN", message: "Link inválido, expirado ou já utilizado." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  await prismaUnscoped.user.update({
    where: { id: user.id },
    data: { passwordHash, isActive: true },
  });

  // (Re)activation → account-activation e-mail (register-mail subscriber).
  eventBus.emit("user.activated", {
    userId: user.id,
    tenantId: user.tenantId ?? null,
  });

  return NextResponse.json({
    ok: true,
    message: "Senha redefinida com sucesso. Faça login com a nova senha.",
  });
}