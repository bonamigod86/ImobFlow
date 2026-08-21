import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";
import { getTenantSlugFromHost } from "@/lib/tenant/subdomain";

/**
 * Edge middleware — tenant/auth context bootstrap for the whole app.
 *
 * Runs before every matched request and:
 *   1. Resolves the tenant hint from the subdomain (or X-Tenant-Slug header).
 *   2. Verifies the httpOnly session JWT (jose — edge safe).
 *   3. Enforces the tenant boundary: a non-MASTER user must match the requested
 *      tenant slug, otherwise the request is rejected (403 / redirect).
 *   4. Stamps verified identity headers consumed downstream by services.
 *
 * Defense in depth: the Node runtime RE-verifies the cookie and re-resolves the
 * tenant status before any DB access — the header claims alone are never
 * trusted for authorization.
 */

const SESSION_HEADERS = {
  userId: "x-user-id",
  role: "x-user-role",
  tenantId: "x-tenant-id",
  tenantSlug: "x-tenant-slug",
  requestedTenant: "x-requested-tenant-slug",
} as const;

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/cadastro" ||
    pathname === "/reset-password" ||
    // Public portal (tenant listing + property detail) — no auth required.
    pathname === "/imoveis" ||
    pathname.startsWith("/imoveis/") ||
    pathname.startsWith("/imovel/") ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/forgot-password" ||
    pathname === "/api/auth/reset-password" ||
    pathname === "/api/register" ||
    pathname === "/api/health" ||
    // Public lead intake (portal forms) — auth comes from its own rate limit.
    pathname.startsWith("/api/public/") ||
    // Provider webhooks — authenticated by gateway signature, not session.
    pathname.startsWith("/api/billing/webhooks") ||
    // Public media bytes (PDP gallery) — READY media is public; mutating
    // media routes still enforce auth inside the route handler.
    pathname.startsWith("/api/media/") ||
    // Public tenant/broker avatar bytes (PDP "anunciado por").
    pathname.startsWith("/api/tenant/profile/image")
  );
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 1 — tenant hint from subdomain; fallback to explicit header for local dev.
  const requestedSlug = getTenantSlugFromHost(req.headers.get("host"));
  const headerSlug = req.headers.get(SESSION_HEADERS.requestedTenant);
  const effectiveSlug = requestedSlug ?? (headerSlug?.trim() || null);

  // 2 — session verification (hurt-after-error → anonymous).
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const headers = new Headers(req.headers);
  if (session) {
    headers.set(SESSION_HEADERS.userId, session.userId);
    headers.set(SESSION_HEADERS.role, session.role);
    headers.set(SESSION_HEADERS.tenantId, session.tenantId ?? "");
    headers.set(SESSION_HEADERS.tenantSlug, session.tenantSlug ?? "");
  }
  if (effectiveSlug) {
    headers.set(SESSION_HEADERS.requestedTenant, effectiveSlug);
  }

  // 3 — tenant boundary reconciliation.
  if (effectiveSlug && session && session.role !== "MASTER") {
    if (session.tenantSlug && session.tenantSlug !== effectiveSlug) {
      return isApiPath(pathname)
        ? NextResponse.json(
            { error: "TENANT_MISMATCH", message: "Session tenant does not match." },
            { status: 403 },
          )
        : NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // 4 — unauthenticated access to protected paths → login.
  if (!session) {
    const loginUrl = new URL("/login", req.url);
    if (effectiveSlug) loginUrl.searchParams.set("tenant", effectiveSlug);
    return isApiPath(pathname)
      ? NextResponse.json(
          { error: "UNAUTHORIZED", message: "Authentication required." },
          { status: 401 },
        )
      : NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Skip static assets and Next internal files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|mp4)$).*)",
  ],
};