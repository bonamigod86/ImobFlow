import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionToken } from "@/lib/auth/jwt";

/** Session cookie options applied consistently across login/logout. */
export const sessionCookieOptions = (): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
} => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

/** Read & verify the session from a Route Handler request (server-only API). */
export async function getSessionFromRequest(
  req: NextRequest,
): Promise<SessionToken | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Read & verify the session in a Server Component (cookies() is available). */
export async function getServerSession(): Promise<SessionToken | null> {
  const store = cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}