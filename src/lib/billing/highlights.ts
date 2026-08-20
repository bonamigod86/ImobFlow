import type {
  BillingProvider,
  HighlightLedgerKind,
  Prisma,
} from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { runDbTx } from "@/lib/prisma/tx";
import { eventBus } from "@/lib/events/event-bus";
import { AppError } from "@/lib/http/errors";
import "../events/register";

/**
 * Highlight monetization — add-on boosts above the plan allocation.
 *
 * Credit model: each highlight credit equals one day of highlighted exposure
 * on a property. Credits come from the monthly plan entitlement (renewed on
 * every paid invoice via the state machine) or from one-off purchases. The
 * ledger is append-only with running balances, so every flow is auditable and
 * reconciliation is a single SUM query away.
 *
 * All helpers stamp `tenantId` explicitly (platform-level code may run without
 * an ambient tenant context).
 */

export interface LedgerInput {
  kind: HighlightLedgerKind;
  amount: number;
  purchaseId?: string;
  note?: string;
}

async function currentBalance(tenantId: string): Promise<number> {
  const last = await prismaUnscoped.highlightCreditLedger.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { balanceAfter: true },
  });
  return last?.balanceAfter ?? 0;
}

/** Append a ledger entry (transaction-aware for use inside $transaction). */
export async function creditHighlights(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: LedgerInput,
): Promise<{ balance: number }> {
  const balanceBefore = await currentBalance(tenantId);
  const balanceAfter = balanceBefore + input.amount;
  await tx.highlightCreditLedger.create({
    data: {
      tenantId,
      kind: input.kind,
      amount: input.amount,
      balanceBefore,
      balanceAfter,
      purchaseId: input.purchaseId,
      note: input.note,
    },
  });
  return { balance: balanceAfter };
}

/** Register the periodic entitlement granted by a plan (called on invoice.paid). */
export async function grantPlanAllotment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  planId: string,
  credits: number,
): Promise<number> {
  if (!credits || credits <= 0) return currentBalance(tenantId);
  const { balance } = await creditHighlights(tx, tenantId, {
    kind: "PLAN_ALLOTMENT",
    amount: credits,
    note: `Cota do plano (renovação da assinatura)`,
    ...(planId ? { purchaseId: undefined } : {}),
  });
  return balance;
}

export async function getHighlightBalance(tenantId: string): Promise<number> {
  return currentBalance(tenantId);
}

/** Open a one-off add-on purchase (checkout is confirmed by the gateway webhook). */
export async function createHighlightPurchase(input: {
  tenantId: string;
  creditsBought: number;
  unitPriceCents: number;
  provider?: BillingProvider;
  metadata?: Record<string, unknown>;
}): Promise<{
  id: string;
  tenantId: string;
  creditsBought: number;
  totalPriceCents: number;
  status: string;
  checkoutUrl: string | null;
}> {
  if (!Number.isInteger(input.creditsBought) || input.creditsBought < 1) {
    throw new AppError(400, "INVALID_CREDITS", "Credits must be a positive integer.");
  }
  if (input.unitPriceCents < 0) {
    throw new AppError(400, "INVALID_PRICE", "Unit price cannot be negative.");
  }
  const totalPriceCents = input.creditsBought * input.unitPriceCents;
  const purchase = await prismaUnscoped.highlightPurchase.create({
    data: {
      tenantId: input.tenantId,
      creditsBought: input.creditsBought,
      unitPriceCents: input.unitPriceCents,
      totalPriceCents,
      provider: input.provider ?? "CUSTOM",
      status: "PENDING",
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
      checkoutUrl: null, // real gateways set a hosted URL here at creation
    },
  });
  return {
    id: purchase.id,
    tenantId: purchase.tenantId,
    creditsBought: purchase.creditsBought,
    totalPriceCents: purchase.totalPriceCents,
    status: purchase.status,
    checkoutUrl: purchase.checkoutUrl,
  };
}

/**
 * Activate a highlight window on a property. Consumes `days` credits from the
 * tenant's ledger; upserts the current window (1:1 per property) and flags the
 * property as featured so the public portal boosts it.
 */
export async function activateHighlight(input: {
  tenantId: string;
  propertyId: string;
  days: number;
  priorityBoost?: number;
  source?: "PLAN" | "PURCHASED";
  purchaseId?: string;
}): Promise<{
  id: string;
  propertyId: string;
  startsAt: Date;
  endsAt: Date;
  creditBalance: number;
}> {
  if (!Number.isInteger(input.days) || input.days < 1) {
    throw new AppError(400, "INVALID_DURATION", "Highlight duration must be at least 1 day.");
  }

  const result = await runDbTx(async (tx) => {
    const balance = await currentBalance(input.tenantId);
    if (balance < input.days) {
      throw new AppError(
        409,
        "INSUFFICIENT_HIGHLIGHT_CREDITS",
        `São necessários ${input.days} créditos de destaque; saldo atual: ${balance}.`,
      );
    }

    const property = await tx.property.findFirst({
      where: { id: input.propertyId, tenantId: input.tenantId },
    });
    if (!property) {
      throw new AppError(404, "PROPERTY_NOT_FOUND", "Imóvel não encontrado.");
    }

    await creditHighlights(tx, input.tenantId, {
      kind: "ACTIVATION_DEBIT",
      amount: -input.days,
      purchaseId: input.purchaseId,
      note: `Destaque ${property.code} por ${input.days} dia(s)`,
    });

    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + input.days * 24 * 60 * 60 * 1000);

    const existing = await tx.propertyHighlight.findFirst({
      where: { propertyId: input.propertyId, tenantId: input.tenantId },
    });
    const highlight = existing
      ? await tx.propertyHighlight.update({
          where: { id: existing.id },
          data: {
            startsAt,
            endsAt,
            priorityBoost: input.priorityBoost ?? Math.max(0, (existing.priorityBoost ?? 1)), 
            source: input.source ?? existing.source,
            purchaseId: input.purchaseId ?? existing.purchaseId,
          },
        })
      : await tx.propertyHighlight.create({
          data: {
            tenantId: input.tenantId,
            propertyId: input.propertyId,
            purchaseId: input.purchaseId,
            source: input.source ?? "PLAN",
            startsAt,
            endsAt,
            priorityBoost: input.priorityBoost ?? 0,
          },
        });

    await tx.property.update({
      where: { id: property.id },
      data: { isFeatured: true },
    });

    return { highlight, balance: balance - input.days };
  });

  eventBus.emit("billing.highlight.activated", {
    tenantId: input.tenantId,
    propertyId: input.propertyId,
    highlightId: result.highlight.id,
    endsAt: result.highlight.endsAt.toISOString(),
  });

  return {
    id: result.highlight.id,
    propertyId: input.propertyId,
    startsAt: result.highlight.startsAt,
    endsAt: result.highlight.endsAt,
    creditBalance: result.balance,
  };
}

/** Expire every highlight whose window already ended; de-features the property. */
export async function expireDueHighlights(): Promise<number> {
  const now = new Date();
  const due = await prismaUnscoped.propertyHighlight.findMany({
    where: { endsAt: { lte: now } },
    include: { property: { select: { id: true, isFeatured: true } } },
  });

  let expired = 0;
  for (const highlight of due) {
    await runDbTx(async (tx) => {
      await tx.propertyHighlight.delete({ where: { id: highlight.id } });
      if (highlight.property.isFeatured) {
        await tx.property.update({
          where: { id: highlight.propertyId },
          data: { isFeatured: false },
        });
      }
    });
    eventBus.emit("billing.highlight.expired", {
      tenantId: highlight.tenantId,
      propertyId: highlight.propertyId,
      highlightId: highlight.id,
    });
    expired += 1;
  }
  return expired;
}

export async function listActiveHighlights(tenantId: string) {
  return prismaUnscoped.propertyHighlight.findMany({
    where: { tenantId, endsAt: { gt: new Date() } },
    include: {
      property: { select: { id: true, code: true, title: true, city: true, state: true, isFeatured: true } },
    },
    orderBy: [{ priorityBoost: "desc" }, { endsAt: "asc" }],
  });
}

export async function listPurchases(tenantId: string) {
  return prismaUnscoped.highlightPurchase.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
}