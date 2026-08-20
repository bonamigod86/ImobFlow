import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { simulateProviderEvent } from "@/lib/billing/service";

/**
 * POST /api/admin/billing/tenants/[id]/simulate  (MASTER-only)
 * Push a synthetic provider event through the real webhook pipeline
 * (signature → normalize → idempotency ledger → state machine). Used by the
 * Master console as a dev sandbox and by the seed to build realistic history.
 */

const simulateSchema = z
  .object({
    type: z.enum([
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.opened",
      "subscription.updated",
      "subscription.deleted",
      "checkout.completed",
    ]),
    overrides: z.record(z.unknown()).optional(),
  })
  .strict();

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req, params) => {
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const body = simulateSchema.parse(await req.json());
  const result = await simulateProviderEvent({
    tenantId: tenantId!,
    type: body.type,
    overrides: body.overrides,
  });
  return ok(result);
});