import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { createHighlightPurchase } from "@/lib/billing/highlights";

/**
 * POST /api/billing/highlights/purchases  (tenant self-service)
 * Open a one-off highlight-credit purchase (PENDING until the gateway confirms).
 * With the CUSTOM gateway there is no hosted checkout — the console provides a
 * "confirm payment" simulate action that runs the real webhook pipeline.
 */

const purchaseSchema = z
  .object({
    creditsBought: z.number().int().min(1).max(1_000_000),
    unitPriceCents: z.number().int().min(0),
    provider: z.enum(["STRIPE", "ASAAS", "CUSTOM"]).optional(),
  })
  .strict();

export const POST = withApiRoute(ACTIONS.BILLING_SELF, async (ctx, req) => {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new Error("Tenant context required for highlight purchases.");
  }
  const body = purchaseSchema.parse(await req.json());
  const purchase = await createHighlightPurchase({
    tenantId,
    creditsBought: body.creditsBought,
    unitPriceCents: body.unitPriceCents,
    provider: body.provider,
  });
  return ok({ purchase });
});