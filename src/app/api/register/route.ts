import { NextResponse, type NextRequest } from "next/server";
import { registerSchema } from "@/lib/validation/schemas";
import { hashPassword } from "@/lib/auth/password";
import { signSessionToken, SESSION_COOKIE } from "@/lib/auth/jwt";
import { sessionCookieOptions } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { TenantAdminService } from "@/lib/tenant/tenant-admin";
import { notifyWelcomeAccount } from "@/lib/email/notify";
import { mapError } from "@/lib/http/errors";
import { rateLimitByIp } from "@/lib/security/rate-limit";
import { extractIpAddress } from "@/lib/http/request-context";
import { env } from "@/lib/config/env";
import "@/lib/events/register";

/**
 * POST /api/register
 * Self-service account creation (Item 3): imobiliária (AGENCY) or autonomous
 * broker (BROKER). Creates its OWN tenant + TRIAL subscription + OWNER account,
 * issues the session cookie and sends the welcome e-mail.
 *
 * Data segregation: the new tenant is a totally separate Tenant row — the
 * ORM tenant-extension scopes every subsequent query to it (fail-closed).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await rateLimitByIp(
      "public-register",
      extractIpAddress(req.headers),
      env.RATE_LIMIT_AUTH,
      env.RATE_LIMIT_WINDOW_SECONDS,
    );

    const body = registerSchema.parse(await req.json().catch(() => ({})));
    const email = body.email.toLowerCase();

    const passwordHash = await hashPassword(body.password);
    const { tenant, ownerId } = await TenantAdminService.registerTenant({
      type: body.type,
      displayName: body.displayName,
      legalName: body.legalName,
      document: body.document,
      creci: body.creci,
      responsibleName: body.responsibleName,
      phone: body.phone,
      whatsapp: body.whatsapp,
      email,
      passwordHash,
      address: body.address,
      city: body.city,
      state: body.state ? String(body.state).toUpperCase() : null,
      description: body.description,
      website: body.website,
      socialLinks: body.socialLinks,
    });

    const token = await signSessionToken({
      userId: ownerId,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      role: "OWNER",
      email,
      name: body.responsibleName,
    });
    cookies().set(SESSION_COOKIE, token, sessionCookieOptions());

    // Non-blocking welcome e-mail (queue-backed).
    await notifyWelcomeAccount(ownerId, {
      tenantName: tenant.name,
      appUrl: env.APP_URL.replace(/\/$/, ""),
    });

    return NextResponse.json(
      {
        user: {
          id: ownerId,
          name: body.responsibleName,
          email,
          role: "OWNER",
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
        },
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, status: tenant.status },
      },
      { status: 201 },
    );
  } catch (error) {
    return mapError(error);
  }
}