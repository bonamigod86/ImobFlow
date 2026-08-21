import { prismaUnscoped } from "@/lib/prisma/client";
import { runDbTx } from "@/lib/prisma/tx";
import { eventBus } from "@/lib/events/event-bus";
import { AppError } from "@/lib/http/errors";
import "../events/register";

/**
 * Privacy / LGPD engine (Checklist Item 20).
 *
 * privacy by design:
 *   - capture already requires explicit consent (LeadConsent, persisted with
 *     text/version, timestamp, IP and origin — "registro de consentimentos,
 *     data/hora, origem e finalidade");
 *   - PII stays minimal and scoped (Lead name/email/phone + optional financial
 *     profile).
 *
 * This module adds the governance half:
 *   - `getLeadPrivacy`   — audit/consent + data-processing trace for one lead;
 *   - `withdrawConsent`  — right of withdrawal → immediate anonymization (PII
 *     erased, consent marked opted-out with timestamp);
 *   - `runRetentionSweep`— retention policy: anonymizes opted-out leads whose
 *     withdrawal is older than `GDPR_RETENTION_DAYS`.
 *
 * Traceability of external sends is covered by `WebhookDelivery`/`Attempt`
 * (each transmission persisted before the HTTP call) and surfaced here via the
 * delivery list. Nothing ever deletes tenant/property data — only personal lead
 * data is anonymized.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const ANONYMIZED_NAME = "[removido]";

async function anonymizeLead(tx: Parameters<Parameters<typeof runDbTx>[0]>[0], leadId: string) {
  await tx.lead.update({
    where: { id: leadId },
    data: {
      name: ANONYMIZED_NAME,
      email: null,
      phone: null,
      payload: undefined,
    },
  });
}

/** Consent + processing trace for a single lead (tenant-scoped). */
export async function getLeadPrivacy(tenantId: string, leadId: string) {
  const lead = await prismaUnscoped.lead.findFirst({
    where: { id: leadId, tenantId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      type: true,
      consent: {
        select: {
          textVersion: true,
          consentText: true,
          grantedAt: true,
          ipAddress: true,
          originUrl: true,
          optedOut: true,
          optedOutAt: true,
        },
      },
      deliveries: {
        select: {
          status: true,
          deliveredAt: true,
          attemptsCount: true,
          endpoint: { select: { name: true, scope: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!lead) throw new AppError(404, "LEAD_NOT_FOUND", "Lead não encontrado.");

  return {
    leadId: lead.id,
    createdAt: lead.createdAt.toISOString(),
    email: lead.email,
    type: lead.type,
    consent: lead.consent
      ? {
          version: lead.consent.textVersion,
          finalidade: lead.consent.consentText,
          grantedAt: lead.consent.grantedAt.toISOString(),
          ipAddress: lead.consent.ipAddress,
          originUrl: lead.consent.originUrl,
          optedOut: lead.consent.optedOut,
          optedOutAt: lead.consent.optedOutAt?.toISOString() ?? null,
        }
      : null,
    deliveries: lead.deliveries.length,
    externalSends: lead.deliveries.map((d) => ({
      status: d.status,
      deliveredAt: d.deliveredAt?.toISOString() ?? null,
      attempts: d.attemptsCount,
      endpoint: `${d.endpoint.name} (${d.endpoint.scope})`,
    })),
  };
}

/** Withdraw consent for a lead and anonymize its personal data immediately. */
export async function withdrawConsent(tenantId: string, leadId: string): Promise<void> {
  const lead = await prismaUnscoped.lead.findFirst({
    where: { id: leadId, tenantId },
    select: { id: true, email: true },
  });
  if (!lead) throw new AppError(404, "LEAD_NOT_FOUND", "Lead não encontrado.");

  await runDbTx(async (tx) => {
    await tx.leadConsent.upsert({
      where: { leadId },
      update: { optedOut: true, optedOutAt: new Date() },
      create: {
        tenantId,
        leadId,
        textVersion: "2026-08-19.v1",
        consentText: "Consentimento retirado pelo titular (direito de opor-se).",
        grantedAt: new Date(),
        optedOut: true,
        optedOutAt: new Date(),
      },
    });
    await anonymizeLead(tx, lead.id);
  });

  eventBus.emit("consent.withdrawn", {
    tenantId,
    leadId,
    anonymized: true,
  });
}

/**
 * Retention policy sweep (Checklist Item 20, "políticas de retenção"). Once an
 * opted-out consent sits beyond the retention window, the lead's personal data
 * is anonymized. Returns how many leads were cleaned.
 */
export async function runRetentionSweep(
  retentionDays: number,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const optedOut = await prismaUnscoped.leadConsent.findMany({
    where: { optedOut: true, optedOutAt: { lte: cutoff } },
    select: { leadId: true, tenantId: true },
  });

  let cleaned = 0;
  for (const c of optedOut) {
    await runDbTx(async (tx) => {
      await tx.leadConsent.update({ where: { leadId: c.leadId }, data: { optedOut: true } });
      await anonymizeLead(tx, c.leadId);
    });
    eventBus.emit("consent.retention_anonymized", {
      tenantId: c.tenantId,
      leadId: c.leadId,
    });
    cleaned += 1;
  }
  return cleaned;
}
