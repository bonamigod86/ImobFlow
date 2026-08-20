import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { activateHighlight } from "@/lib/billing/highlights";

/**
 * POST /api/billing/highlights/activate  (tenant self-service)
 * Consume credits to feature a property for `days`. The consumed credits are
 * debited from the tenant ledger; the property becomes `isFeatured` so the
 * public portal boosts it.
 */

const activateSchema = z
  .object({
    propertyId: z.string().min(1),
    days: z.number().int().min(1).max(3650),
    priorityBoost: z.number().int().min(0).max(10).optional(),
    source: z.enum(["PLAN", "PURCHASED"]).optional(),
    purchaseId: z.string().optional(),
  })
  .strict();

export const POST = withApiRoute(ACTIONS.BILLING_SELF, async (ctx, req) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new Error("Tenant context required to activate highlights.");
  }
  const body = activateSchema.parse(await req.json());
  const highlight = await activateHighlight({
    tenantId,
    propertyId: body.propertyId,
    days: body.days,
    priorityBoost: body.priorityBoost,
    source: body.source,
    purchaseId: body.purchaseId,
  });
  const balance = highlight.creditBalance;
  return ok({ highlight, balance });
});