import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail, mapError } from "@/lib/http/errors";
import { TenantAdminService } from "@/lib/tenant/tenant-admin";
import { tenantProfilePatchSchema } from "@/lib/validation/schemas";

/**
 * GET/PATCH /api/tenant/profile  (tenant self-service — OWNER/MANAGER/AGENT)
 * Read and update the subscriber's registration profile (Item 3). The ambient
 * tenant context from `withApiRoute` guarantees the change lands only on the
 * caller's own tenant (ORM extension is fail-closed).
 */
export const GET = withApiRoute(ACTIONS.TENANT_READ, async (ctx) => {
  if (!ctx.tenantId) {
    return fail(400, "NO_TENANT", "Master account has no tenant profile.");
  }
  const data = await TenantAdminService.getProfile(ctx.tenantId, ctx.userId);
  return ok(data);
});

export const PATCH = withApiRoute(ACTIONS.TENANT_UPDATE, async (ctx, req: NextRequest) => {
  if (!ctx.tenantId) {
    return fail(400, "NO_TENANT", "Master account has no tenant profile.");
  }
  try {
    const parsed = tenantProfilePatchSchema.parse(await req.json().catch(() => ({})));
    const result = await TenantAdminService.updateProfile(ctx.tenantId, ctx.userId, {
      tenant: parsed.tenant as Record<string, unknown> | undefined,
      broker: parsed.broker as Record<string, unknown> | undefined,
    });
    return ok(result);
  } catch (error) {
    return mapError(error);
  }
});