import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { getSessionFromRequest } from "@/lib/auth/session";
import { hasPermission, type Principal } from "@/lib/rbac/has-permission";
import type { Action } from "@/lib/rbac/actions";
import { TenantContextStore, type TenantContext } from "@/lib/tenant/context";
import { TenantResolver } from "@/lib/tenant/resolver";
import { RequestContextStore, newRequestId } from "@/lib/http/request-context";
import { fail } from "@/lib/http/errors";
import { mapError } from "@/lib/http/errors";
import type { AuthenticatedUser } from "@/types";
import "../events/register";

/**
 * The single security wrapper for protected API routes.
 *
 * Pipeline (executed on every protected request):
 *   1. Re-verify the session JWT from the httpOnly cookie (source of truth).
 *   2. RBAC gate: principal must hold `action`.
 *   3. Resolve the tenant from the (verified) claims, assert it is ACTIVE.
 *   4. Register the ambient Tenant + Request context (AsyncLocalStorage) so the
 *      Prisma tenant-extension auto-scopes EVERY query the handler runs.
 *   5. Run the handler; map any error to a safe HTTP response.
 *
 * Even if code forgets a tenant filter, step (4) makes leaking impossible.
 */

export interface RouteContext {
  tenantId: string | null;
  tenantSlug: string | null;
  userId: string;
  role: UserRole;
  user: AuthenticatedUser;
}

type RouteParams = Record<string, string | string[] | undefined>;

interface HandlerArgs {
  params?: RouteParams | Promise<RouteParams>;
}

/**
 * CSRF defense-in-depth on top of SameSite=Lax cookies: browsers attach an
 * `Origin` header to every cross-site state-changing request. If present and
 * it does not match the server's own Host, reject before the handler runs.
 * Requests without `Origin` (curl, server-to-server, internal) are untouched.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function assertSafeOrigin(req: NextRequest): NextResponse | null {
  if (!UNSAFE_METHODS.has(req.method)) return null;
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return null;
  try {
    if (new URL(origin).host === host) return null;
  } catch {
    return null;
  }
  return fail(403, "CSRF_REJECTED", "Cross-origin request blocked.");
}

export function withApiRoute(
  action: Action,
  handler: (
    ctx: RouteContext,
    req: NextRequest,
    params: RouteParams,
  ) => Promise<NextResponse>,
) {
  return async (req: NextRequest, route: HandlerArgs = {}): Promise<NextResponse> => {
    try {
      const session = await getSessionFromRequest(req);

      // 0 — CSRF: reject cross-origin state-changing requests.
      const csrf = assertSafeOrigin(req);
      if (csrf) return csrf;

      if (!session) {
        return fail(401, "UNAUTHORIZED", "Authentication required.");
      }

      // 2 — RBAC gate.
      const principal: Principal = { role: session.role, tenantId: session.tenantId };
      if (!hasPermission(principal, action)) {
        return fail(403, "FORBIDDEN", `Missing permission: ${action}`);
      }

      // 3 — Tenant resolution + status gate.
      let tenantSlug = session.tenantSlug;
      if (session.tenantId) {
        const tenant = await TenantResolver.assertActiveById(session.tenantId);
        tenantSlug = tenant.slug;
      }

      const params: RouteParams = await (route.params ?? {});
      const requestId = newRequestId();

      // 4 — Ambient context registration (tenant + http metadata).
      const tenantCtx: TenantContext = {
        tenantId: session.tenantId,
        tenantSlug,
        userId: session.userId,
        role: session.role,
      };

      const routeCtx: RouteContext = {
        tenantId: session.tenantId,
        tenantSlug,
        userId: session.userId,
        role: session.role,
        user: {
          id: session.userId,
          email: session.email,
          name: session.name,
          role: session.role,
          tenantId: session.tenantId,
          tenantSlug,
        },
      };

      const httpCtx = {
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: req.headers.get("user-agent"),
        requestId,
      };

      return await TenantContextStore.run(tenantCtx, () =>
        RequestContextStore.run(httpCtx, () => handler(routeCtx, req, params)),
      );
    } catch (error) {
      return mapError(error);
    }
  };
}