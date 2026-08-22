import { NextResponse, NextRequest } from "next/server";
import { loginSchema } from "@/lib/validation/schemas";
import { prismaUnscoped } from "@/lib/prisma/client";
import { verifyPassword } from "@/lib/auth/password";
import { signSessionToken, SESSION_COOKIE } from "@/lib/auth/jwt";
import { TenantResolver } from "@/lib/tenant/resolver";
import { sessionCookieOptions } from "@/lib/auth/session";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { mapError, fail } from "@/lib/http/errors";
import { cookies } from "next/headers";
import { rateLimitByIp } from "@/lib/security/rate-limit";
import { extractIpAddress } from "@/lib/http/request-context";
import { env } from "@/lib/config/env";
import "@/lib/events/register";

/**
 * POST /api/auth/login
 * Verifies credentials, checks tenant health, issues the session JWT and
 * stamps it as an httpOnly cookie. Audit-trailed (AUTH_LOGIN).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await rateLimitByIp(
      "auth-login",
      extractIpAddress(req.headers),
      env.RATE_LIMIT_AUTH,
      env.RATE_LIMIT_WINDOW_SECONDS,
    );

    const body = loginSchema.parse(await req.json());
    const email = body.email.toLowerCase();
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    const user = await prismaUnscoped.user.findUnique({ where: { email } });

    const authenticated =
      user &&
      user.isActive &&
      (await verifyPassword(body.password, user.passwordHash));

    if (!authenticated || !user) {
      await AuditService.logAsync({
        action: AUDIT_ACTIONS.AUTH_LOGIN_FAILED,
        entity: "User",
        entityId: user?.id ?? null,
        details: { email, reason: user ? "invalid_password" : "unknown_user" },
        ipAddress: ip,
      });
      return fail(401, "INVALID_CREDENTIALS", "E-mail or password invalid.");
    }

    // Resolve the tenant boundary (MASTER users may be NULL tenant).
    let tenant = null;
    if (user.tenantId) {
      tenant = await TenantResolver.resolveById(user.tenantId);
      if (!tenant) return fail(403, "TENANT_NOT_FOUND", "Tenant not found.");
      if (tenant.status === "BLOCKED" || tenant.status === "CANCELLED") {
        return fail(403, "TENANT_INACTIVE", "This account's tenant is inactive.");
      }
      // Cadastro ainda não aprovado pelo MASTER.
      if (!tenant.approvedAt) {
        return fail(403, "TENANT_PENDING_APPROVAL", "Cadastro aguardando aprovação da plataforma.");
      }
    }

    // Optional tenant targeting (subdomain / login page tenant selector).
    if (body.tenantSlug && user.role !== "MASTER") {
      const target = await TenantResolver.resolveBySlug(body.tenantSlug);
      const tenantMatch = target && user.tenantId === target.id;
      if (!tenantMatch) {
        return fail(403, "TENANT_MISMATCH", "Account does not belong to that tenant.");
      }
      tenant = tenant ?? (await TenantResolver.resolveById(user.tenantId!));
    }

    const token = await signSessionToken({
      userId: user.id,
      tenantId: user.tenantId,
      tenantSlug: tenant?.slug ?? null,
      role: user.role,
      email: user.email,
      name: user.name,
    });

    await prismaUnscoped.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    cookies().set(SESSION_COOKIE, token, sessionCookieOptions());

    await AuditService.logAsync({
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      entity: "User",
      entityId: user.id,
      tenantId: user.tenantId,
      userId: user.id,
      ipAddress: ip,
      details: { email: user.email, method: "password", tenantSlug: tenant?.slug },
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          tenantSlug: tenant?.slug ?? null,
        },
        tenant: tenant
          ? { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status }
          : null,
      },
      { status: 200 },
    );
  } catch (error) {
    return mapError(error);
  }
}