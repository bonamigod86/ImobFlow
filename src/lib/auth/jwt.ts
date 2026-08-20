import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@prisma/client";
import { parseDurationToSeconds } from "@/lib/config/env";

/**
 * Session JWT utilities (edge-safe — used by the Next.js middleware and by
 * Node runtime code alike via jose).
 *
 * Payload contract:
 *   { userId, tenantId, tenantSlug, role, email, name }
 *
 * Signed with HS256 using JWT_SECRET. The token is what links an HTTP request
 * to a user+tenant principal; the Node runtime additionally re-verifies the
 * token and resolves the tenant (status/RBAC) on every protected route.
 */

export const SESSION_COOKIE = process.env.SESSION_COOKIE || "saas_session";
export const JWT_ISSUER = "saas-imob";

/** Claims embedded in the session JWT. */
export interface SessionToken {
  userId: string;
  tenantId: string | null;
  tenantSlug: string | null;
  role: UserRole;
  email: string;
  name: string;
}

export function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be set and at least 32 characters long (openssl rand -hex 32).",
    );
  }
  return new TextEncoder().encode(secret);
}

/** Create a signed session token. */
export async function signSessionToken(payload: SessionToken): Promise<string> {
  const expiresIn = parseDurationToSeconds(process.env.JWT_EXPIRES_IN ?? "8h");
  return new SignJWT({
    tenantId: payload.tenantId,
    tenantSlug: payload.tenantSlug,
    role: payload.role,
    email: payload.email,
    name: payload.name,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(payload.userId)
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
    .sign(getJwtSecretKey());
}

/** Verify a session token; returns null for any invalid/expired token. */
export async function verifySessionToken(token: string): Promise<SessionToken | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      issuer: JWT_ISSUER,
    });
    const sub = payload.sub;
    if (!sub) return null;
    return {
      userId: sub,
      tenantId: (payload.tenantId as string | null) ?? null,
      tenantSlug: (payload.tenantSlug as string | null) ?? null,
      role: payload.role as UserRole,
      email: (payload.email as string) ?? "",
      name: (payload.name as string) ?? "",
    };
  } catch {
    return null;
  }
}