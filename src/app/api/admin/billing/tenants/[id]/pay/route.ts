import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";
import { settleInvoiceAutomatically } from "@/lib/billing/renewals";

/**
 * POST /api/admin/billing/tenants/[id]/pay  (MASTER-only)
 * Auto-collect: settle the tenant's earliest OPEN/OVERDUE renewal invoice
 * against the platform books (no real gateway). Routes the payment through the
 * canonical `invoice.paid` pipeline (ledger idempotency + state machine) so the
 * subscription rolls over and re-activates exactly like a gateway webhook.
 */

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async (_ctx, _req, params) => {
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  const invoice = await prismaUnscoped.paymentInvoice.findFirst({
    where: { tenantId: tenantId!, status: { in: ["OPEN", "OVERDUE"] } },
    orderBy: { dueDate: "asc" },
  });
  if (!invoice) {
    return ok({ settled: false, reason: "no_open_invoice" });
  }
  const result = await settleInvoiceAutomatically(invoice.id);
  return ok({ settled: true, invoiceId: invoice.id, outcome: result.outcome });
});