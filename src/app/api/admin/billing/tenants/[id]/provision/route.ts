import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { provisionSubscription } from "@/lib/billing/service";

/**
 * POST /api/admin/billing/tenants/[id]/provision  (MASTER-only)
 * Provision (or re-provision) a tenant on a plan. Idempotent unless `force`.
 */

const provisionSchema = z
  .object({
    planCode: z.string().min(1),
    provider: z.enum(["STRIPE", "ASAAS", "CUSTOM"]).optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    force: z.boolean().optional(),
  })
  .strict();

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req, params) => {
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const body = provisionSchema.parse(await req.json());
  const subscription = await provisionSubscription({
    tenantId: tenantId!,
    planCode: body.planCode,
    provider: body.provider,
    trialDays: body.trialDays,
    force: body.force,
  });
  return ok({ subscription });
});