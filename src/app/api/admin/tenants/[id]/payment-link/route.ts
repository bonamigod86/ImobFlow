import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";
import { notifyPaymentLink } from "@/lib/email/notify";
import { tenantBaseUrl } from "@/lib/admin/control";
import { formatCentsBRL } from "@/lib/money";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * POST /api/admin/tenants/[id]/payment-link  (MASTER-only)
 * Dispatch a payment-link e-mail to the tenant OWNER for the oldest overdue
 * (or next due) invoice. Non-blocking on the mail transport — the message is
 * rendered synchronously and enqueued on the EMAIL_SEND BullMQ queue.
 */

export const runtime = "nodejs";

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, _req, params) => {
  const tenantId = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!tenantId) {
    return fail(400, "BAD_REQUEST", "Missing tenant id.");
  }

  const tenant = await prismaUnscoped.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      plan: { select: { name: true } },
      subscription: { select: { priceCents: true, nextInvoiceDueAt: true } },
    },
  });
  if (!tenant) {
    return fail(404, "TENANT_NOT_FOUND", "Tenant not found.");
  }

  const invoice = await prismaUnscoped.paymentInvoice.findFirst({
    where: { tenantId, status: { in: ["OPEN", "OVERDUE"] } },
    orderBy: { dueDate: "asc" },
    select: { amountCents: true, dueDate: true },
  });

  const amountCents = invoice?.amountCents ?? tenant.subscription?.priceCents ?? 0;
  const dueDate = invoice?.dueDate ?? tenant.subscription?.nextInvoiceDueAt ?? new Date();
  const baseUrl = tenantBaseUrl(tenant.slug);
  const paymentUrl = `${baseUrl}/dashboard/billing`;

  await notifyPaymentLink(tenantId, {
    tenantName: tenant.name,
    planName: tenant.plan?.name ?? "Plano",
    amountBRL: formatCentsBRL(amountCents),
    dueDate: dueDate.toISOString(),
    paymentUrl,
    appUrl: baseUrl,
  });

  await AuditService.log({
    action: AUDIT_ACTIONS.TENANT_PAYMENT_LINK_SENT,
    entity: "Tenant",
    entityId: tenant.id,
    tenantId: tenant.id,
    userId: ctx.userId,
    details: { amountCents, dueDate: dueDate.toISOString(), paymentUrl },
  });

  return ok({ sent: true, amountCents, dueDate: dueDate.toISOString(), paymentUrl });
});