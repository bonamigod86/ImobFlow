import { prismaUnscoped } from "@/lib/prisma/client";
import { eventBus } from "@/lib/events/event-bus";
import { AppError } from "@/lib/http/errors";
import type { NormalizedBillingEvent } from "@/lib/billing/types";
import { ingestNormalizedEvent } from "@/lib/billing/billing-events";
import "../events/register";

/**
 * Recurring-charge engine (checklist item 13).
 *
 * A platform without a real gateway stops at "invoice issued, wait for money".
 * This module provides the two halves the subscription lifecycle still needs:
 *
 *   1. `runGlobalRenewalScan` — a bill-every-cycle rule that, once an ACTIVE
 *      subscription passes its `nextInvoiceDueAt` (the due date the paid
 *      period ended on), mints the next OPEN invoice for the following period.
 *      It NEVER advances `nextInvoiceDueAt`: that only happens on payment
 *      (state machine rollover), so a late invoice stays visible to dunning.
 *
 *   2. `settleInvoiceAutomatically` — "auto-collect": an operator/pivot marks
 *      an OPEN/OVERDUE invoice as paid on the platform without a gateway
 *      round-trip. It runs through the REAL webhook pipeline (idempotency
 *      ledger + state machine) so a paid renewal rolls over cleanly.
 *
 * Idempotency: invoices are guarded by `providerInvoiceId` (unique) for the
 * local mints and by the `BillingEvent` ledger for auto-collected payments.
 */

export interface GlobalRenewalScanResult {
  /** NEW OPEN invoices minted for the next period. */
  opened: number;
  /** ACTIVE subscriptions past their due date that already have an OPEN/OVERDUE invoice. */
  alreadyOpen: number;
  /** Free plans (priceCents = 0) — never invoiced. */
  skippedFree: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bill every cycle: mint the next-period invoice for ACTIVE subscriptions whose
 * `nextInvoiceDueAt` has fully elapsed. Runs on the daily billing worker (and
 * the MASTER "run now" scan) before the dunning sweep.
 */
export async function runGlobalRenewalScan(
  now: Date = new Date(),
): Promise<GlobalRenewalScanResult> {
  const result: GlobalRenewalScanResult = { opened: 0, alreadyOpen: 0, skippedFree: 0 };

  const dueSubs = await prismaUnscoped.tenantSubscription.findMany({
    where: { status: "ACTIVE", nextInvoiceDueAt: { lte: now } },
    include: { plan: { select: { priceCents: true } } },
  });

  for (const sub of dueSubs) {
    if (sub.plan.priceCents <= 0) {
      result.skippedFree += 1;
      continue;
    }
    if (!sub.nextInvoiceDueAt) continue;

    const alreadyInvoiced = await prismaUnscoped.paymentInvoice.findFirst({
      where: {
        subscriptionId: sub.id,
        status: { in: ["OPEN", "OVERDUE"] },
      },
      select: { id: true },
    });
    if (alreadyInvoiced) {
      result.alreadyOpen += 1;
      continue;
    }

    const dueDate = sub.nextInvoiceDueAt;
    await prismaUnscoped.paymentInvoice.create({
      data: {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        providerInvoiceId: `local:${sub.id}:${dueDate.getTime()}`,
        amountCents: sub.plan.priceCents,
        status: "OPEN",
        dueDate,
      },
    });
    result.opened += 1;

    eventBus.emit("billing.invoice.opened", {
      tenantId: sub.tenantId,
      subscriptionId: sub.id,
      amountCents: sub.plan.priceCents,
      dueDate: dueDate.toISOString(),
    });
  }

  return result;
}

/**
 * Settle an OPEN/OVERDUE invoice against the platform books (no real gateway).
 * Routes through the canonical event pipeline so every side effect (ledger,
 * subscription ACTIVE, tenant unblock, highlight credits, invoices, audit,
 * notification) stays identical to a gateway `invoice.paid` webhook.
 */
export async function settleInvoiceAutomatically(invoiceId: string): Promise<{
  outcome: Awaited<ReturnType<typeof ingestNormalizedEvent>>;
}> {
  const invoice = await prismaUnscoped.paymentInvoice.findUnique({
    where: { id: invoiceId },
  });
  if (!invoice) {
    throw new AppError(404, "INVOICE_NOT_FOUND", `Fatura ${invoiceId} não encontrada.`);
  }

  // Already settled on another path? Never re-pay (idempotent by construction).
  if (invoice.status === "PAID") {
    return {
      // Re-run the pipeline anyway for a stable outcome via the ledger.
      outcome: await ingestNormalizedEvent(
        "CUSTOM",
        buildPaidEvent(invoice, null),
        JSON.stringify({ autoCollect: true, invoiceId }),
      ),
    };
  }

  const subscription = invoice.subscriptionId
    ? await prismaUnscoped.tenantSubscription.findUnique({
        where: { id: invoice.subscriptionId },
      })
    : null;

  const event = buildPaidEvent(invoice, subscription);
  const outcome = await ingestNormalizedEvent("CUSTOM", event, JSON.stringify(event.raw));

  eventBus.emit("billing.invoice.autocollected", {
    tenantId: invoice.tenantId,
    subscriptionId: subscription?.id ?? null,
    invoiceId: invoice.id,
    amountCents: invoice.amountCents,
  });

  return { outcome };
}

function buildPaidEvent(
  invoice: { id: string; tenantId: string; amountCents: number; dueDate: Date; providerInvoiceId: string | null },
  subscription: { providerSubscriptionId: string | null } | null,
): NormalizedBillingEvent {
  const raw = {
    autoCollect: true,
    invoiceId: invoice.id,
    source: "platform-auto-collect",
  };
  return {
    providerEventId: `auto-collect:${invoice.id}`,
    type: "invoice.paid",
    tenantId: invoice.tenantId,
    providerSubscriptionId: subscription?.providerSubscriptionId ?? undefined,
    providerInvoiceId: invoice.providerInvoiceId ?? undefined,
    amountCents: invoice.amountCents,
    dueDate: invoice.dueDate.toISOString(),
    paidAt: new Date().toISOString(),
    raw,
  };
}

/** Convenience alias — the billing worker and MASTER action call this too. */
export const runRenewalScan = runGlobalRenewalScan;