import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";
import { simulateProviderEvent } from "@/lib/billing/service";

/**
 * POST /api/billing/highlights/purchases/[id]/pay  (tenant self-service)
 * CUSTOM-gateway payment confirmation. Terra-form a `checkout.completed`
 * provider event carrying the purchase metadata and push it through the real
 * webhook pipeline — which credits the ledger exactly once.
 */

export const POST = withApiRoute(ACTIONS.BILLING_SELF, async (ctx, req, params) => {
  const tenantId = ctx.tenantId;
  const purchaseId = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!tenantId || !purchaseId) {
    throw new Error("Tenant context and purchase id required.");
  }

  const purchase = await prismaUnscoped.highlightPurchase.findFirst({
    where: { id: purchaseId, tenantId },
  });
  if (!purchase) {
    throw new Error("Purchase not found for this tenant.");
  }
  if (purchase.status === "PAID") {
    return ok({ alreadyPaid: true, purchaseId });
  }

  const result = await simulateProviderEvent({
    tenantId,
    type: "checkout.completed",
    overrides: {
      invoiceId: `inv_${Date.now().toString(36)}`,
      metadata: {
        kind: "highlight_credits",
        purchaseId: purchase.id,
      },
    },
  });

  return ok({ outcomes: result.outcomes, purchaseId });
});