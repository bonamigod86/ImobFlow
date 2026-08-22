import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";

/**
 * POST /api/admin/tenants/[id]/approve  (MASTER-only)
 * Aprova o cadastro de um tenant pendente — libera o acesso do assinante.
 */
export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async (_ctx, _req, params) => {
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const tenant = await prismaUnscoped.tenant.findUnique({ where: { id: id! } });
  if (!tenant) return fail(404, "NOT_FOUND", "Tenant not found.");
  if (tenant.approvedAt) return ok({ tenant, already: true });

  const updated = await prismaUnscoped.tenant.update({
    where: { id: tenant.id },
    data: { approvedAt: new Date() },
  });
  return ok({ tenant: updated, already: false });
});