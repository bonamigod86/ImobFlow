import { eventBus } from "@/lib/events/event-bus";
import { env } from "@/lib/config/env";
import { prismaUnscoped } from "@/lib/prisma/client";
import { centsToBRL, CYCLE_LABELS } from "@/lib/billing/types";
import {
  notifyAccountActivation,
  notifyAccountReactivated,
  notifyFinalLockout,
  notifyInvoicePaid,
  notifyInvoicePastDue,
  notifyLastWarning,
  notifyNextDue,
  notifySubscriptionCancelled,
  notifySubscriptionCreated,
  notifyWelcomeAccount,
} from "@/lib/email/notify";

/**
 * Wires domain events -> transactional e-mails.
 *
 * Imported (side-effect) by events/register.ts so the mapping is installed in
 * both the web and worker runtimes. Every dispatch is best-effort and
 * asynchronous (BullMQ) — a mail outage never breaks the originating mutation.
 *
 * Deliberately NOT wired to the queue in process: the NotifyService enqueues.
 */

const APP_URL = env.APP_URL;

let registered = false;

export function registerMailSubscribers(): void {
  if (registered) return;
  registered = true;

  eventBus.on("billing.invoice.paid", async (p) => {
    const sub = await prismaUnscoped.tenantSubscription.findUnique({
      where: { id: p.subscriptionId },
      include: { plan: { select: { name: true } }, tenant: { select: { name: true } } },
    });
    if (!sub) return;
    await notifyInvoicePaid(p.tenantId, {
      tenantName: sub.tenant.name,
      planName: sub.plan.name,
      amountBRL: centsToBRL(p.amountCents),
      invoiceId: p.invoiceId,
      paidAt: p.paidAt,
      appUrl: APP_URL,
    });
  });

  eventBus.on("billing.dunning.notified", (p) => {
    void (async () => {
      const sub = await prismaUnscoped.tenantSubscription.findUnique({
        where: { id: p.subscriptionId ?? "__none__" },
        include: { plan: { select: { name: true } }, tenant: { select: { name: true } } },
      });
      if (!sub) return;

      // Dunning email routing:
      //   - PAYMENT_FAILED → "fatura em atraso" (first failure)
      //   - PRE_DUE / DUE_REMINDER → "próximo vencimento"
      //   - LATE_REMINDER        → "último aviso" (before suspension)
      if (p.kind === "PAYMENT_FAILED") {
        await notifyInvoicePastDue(p.tenantId, {
          tenantName: sub.tenant.name,
          planName: sub.plan.name,
          amountBRL: centsToBRL(sub.priceCents),
          dueDate: p.dueDate,
          graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
          appUrl: APP_URL,
        });
      } else if (p.kind === "PRE_DUE" || p.kind === "DUE_REMINDER") {
        await notifyNextDue(p.tenantId, {
          tenantName: sub.tenant.name,
          planName: sub.plan.name,
          amountBRL: centsToBRL(sub.priceCents),
          dueDate: p.dueDate,
          appUrl: APP_URL,
        });
      } else if (p.kind === "LATE_REMINDER") {
        await notifyLastWarning(p.tenantId, {
          tenantName: sub.tenant.name,
          planName: sub.plan.name,
          amountBRL: centsToBRL(sub.priceCents),
          dueDate: p.dueDate,
          graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
          appUrl: APP_URL,
        });
      }
    })();
  });

  eventBus.on("billing.subscription.cancelled", (p) => {
    void (async () => {
      const sub = await prismaUnscoped.tenantSubscription.findUnique({
        where: { id: p.subscriptionId },
        include: { plan: { select: { name: true } }, tenant: { select: { name: true } } },
      });
      if (!sub) return;
      await notifySubscriptionCancelled(p.tenantId, {
        tenantName: sub.tenant.name,
        planName: sub.plan.name,
        cancelledAt: p.cancelledAt,
        appUrl: APP_URL,
      });
    })();
  });

  eventBus.on("billing.subscription.blocked", (p) => {
    const reasons: Record<string, string> = {
      grace_period_expired: "prazo de carência esgotado sem pagamento",
      manual: "bloqueio manual pela operação",
    };
    void (async () => {
      const tenant = await prismaUnscoped.tenant.findUnique({
        where: { id: p.tenantId },
        select: { name: true },
      });
      if (!tenant) return;
      await notifyFinalLockout(p.tenantId, {
        tenantName: tenant.name,
        reason: reasons[p.reason] ?? p.reason,
        blockedAt: p.blockedAt,
        appUrl: APP_URL,
      });
    })();
  });

  eventBus.on("billing.subscription.reactivated", (p) => {
    void (async () => {
      const sub = await prismaUnscoped.tenantSubscription.findUnique({
        where: { id: p.subscriptionId },
        include: { plan: { select: { name: true } }, tenant: { select: { name: true } } },
      });
      if (!sub) return;
      await notifyAccountReactivated(p.tenantId, {
        tenantName: sub.tenant.name,
        planName: sub.plan.name,
        appUrl: APP_URL,
      });
    })();
  });

  eventBus.on("billing.subscription.provisioned", (p) => {
    void (async () => {
      await notifySubscriptionCreated(p.tenantId, {
        tenantName: (await prismaUnscoped.tenant.findUnique({
          where: { id: p.tenantId },
          select: { name: true },
        }))?.name ?? p.planName,
        planName: p.planName,
        amountBRL: centsToBRL(p.priceCents),
        cycle: CYCLE_LABELS[p.billingCycle],
        trialDays: p.trialDays > 0 ? p.trialDays : null,
        appUrl: APP_URL,
      });
    })();
  });

  eventBus.on("user.created", async (p) => {
    if (p.tenantName) {
      await notifyWelcomeAccount(
        p.userId,
        { tenantName: p.tenantName, appUrl: APP_URL },
      );
    }
  });

  eventBus.on("user.activated", (p) => {
    void (async () => {
      await notifyAccountActivation(
        p.userId,
        { actionUrl: `${APP_URL}/login`, appUrl: APP_URL },
      );
    })();
  });
}

// Self-register on import (same pattern as events/register.ts).
registerMailSubscribers();