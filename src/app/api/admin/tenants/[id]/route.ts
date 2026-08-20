import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { tenantStatusSchema } from "@/lib/validation/schemas";
import { TenantAdminService } from "@/lib/tenant/tenant-admin";
import { ok } from "@/lib/http/errors";

/**
 * PATCH /api/admin/tenants/[id]  (MASTER-only)
 * Transition a tenant lifecycle status. Emits tenant.status_changed → audit.
 * The RBAC gate ensures only MASTER holds `tenant:change-status`.
 */

export const PATCH = withApiRoute(ACTIONS.TENANT_CHANGE_STATUS, async (ctx, req, params) => {
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const body = tenantStatusSchema.parse(await req.json());
  const tenant = await TenantAdminService.changeStatus({
    tenantId: tenantId!,
    newStatus: body.status,
    actorUserId: ctx.userId,
    reason: body.reason,
  });
  return ok({ tenant });
});