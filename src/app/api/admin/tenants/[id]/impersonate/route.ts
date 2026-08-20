import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";
import { SESSION_COOKIE, signSessionToken } from "@/lib/auth/jwt";
import { sessionCookieOptions } from "@/lib/auth/session";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * POST /api/admin/tenants/[id]/impersonate  (MASTER-only)
 * Swap the current session for the target tenant's OWNER account. The freshly
 * signed session Cookie is returned via Set-Cookie (same-origin fetch), so the
 * browser ends up browsing /dashboard as that tenant. The MASTER session is
 * intentionally replaced — sign out to recover it.
 */

export const runtime = "nodejs";

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, _req, params) => {
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;

  const tenant = await prismaUnscoped.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      users: {
        where: { role: "OWNER", isActive: true },
        select: { id: true, name: true, email: true },
        take: 1,
      },
    },
  });

  if (!tenant) {
    return fail(404, "TENANT_NOT_FOUND", "Tenant not found.");
  }
  const owner = tenant.users[0];
  if (!owner) {
    return fail(409, "NO_ACTIVE_OWNER", "This tenant has no active OWNER to impersonate.");
  }

  const token = await signSessionToken({
    userId: owner.id,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    role: "OWNER",
    email: owner.email,
    name: owner.name,
  });

  await AuditService.log({
    action: AUDIT_ACTIONS.TENANT_IMPERSONATED,
    entity: "Tenant",
    entityId: tenant.id,
    tenantId: tenant.id,
    userId: ctx.userId,
    details: { impersonatedUser: owner.email, targetSlug: tenant.slug, targetRole: "OWNER" },
  });

  const response = ok({ impersonating: true, redirect: "/dashboard" });
  const s = sessionCookieOptions();
  response.headers.set(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=${s.sameSite}; Path=${s.path}${s.secure ? "; Secure" : ""}`,
  );
  return response;
});