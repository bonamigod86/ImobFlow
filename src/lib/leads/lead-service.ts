import { Prisma } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { QueueManager } from "@/lib/queues/queue-manager";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { consentTextFor, CURRENT_CONSENT_VERSION } from "@/lib/leads/consent";
import { selectRoutingEndpoint, type RoutingCandidate } from "@/lib/leads/routing";
import { idempotencyKey } from "@/lib/integrations/signatures";
import { AppError } from "@/lib/http/errors";
import {
  notifyNewLeadAlert,
  notifyVisitRequest,
} from "@/lib/email/notify";
import { env } from "@/lib/config/env";
import "../events/register";

/**
 * Lead Engine — capture + routing facade.
 *
 * Every capture path converges here so that LGPD consent, tenant isolation and
 * webhook dispatch are enforced exactly once per lead:
 *
 *   1. Persist the lead (and optional financial profile) + consent FIRST —
 *      zero-loss capture, even if a later step fails.
 *   2. Determine destination(s):
 *        - real-estate  -> ACTIVE `REAL_ESTATE` endpoints owned by the lead's
 *                          tenant or the platform (never another tenant's).
 *        - financial    -> evaluated `RoutingRule` (tenant rules first, then
 *                          platform) selected via `selectRoutingEndpoint`.
 *   3. Create a durable `WebhookDelivery` (stable idempotency key) per target
 *      and enqueue `lead.created` on the webhook-transmission queue.
 *   4. Enqueue async enrichment on the lead-routing queue.
 *
 * All writes here use the unscoped client with EXPLICIT tenantId stamping —
 * this is a cross-tenant public entry point (there is no ambient tenant).
 */

export interface ClientMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
  originUrl?: string | null;
}

export interface RealEstateLeadInput {
  propertyId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  schedule?: { date?: string; time?: string } | null;
  utm: Record<string, string>;
  consentTextVersion: string;
  client: ClientMeta;
}

export interface FinancialLeadInput {
  name: string;
  email: string;
  phone: string;
  propertyValue: number;
  downPayment: number;
  financingAmount?: number | null;
  monthlyIncome: number;
  monthlyInstallmentLimit: number;
  termMonths: number;
  city: string;
  state: string;
  tenantSlug?: string | null;
  propertyId?: string | null;
  utm: Record<string, string>;
  consentTextVersion: string;
  client: ClientMeta;
}

export interface DispatchResult {
  deliveryId: string;
  jobId: string | null;
  endpointId: string;
  endpointName: string;
  matchedRuleId?: string | null;
}

export interface LeadCaptureResult {
  leadId: string;
  type: "REAL_ESTATE" | "FINANCIAL";
  tenantId: string;
  routing: "internal" | "external";
  deliveries: DispatchResult[];
}

/** Visible listing lookup shared by both capture paths (cross-tenant). */
async function resolveVisibleProperty(propertyId: string) {
  const property = await prismaUnscoped.property.findFirst({
    where: { id: propertyId, isActive: true, status: "ACTIVE", tenant: { status: "ACTIVE" } },
    select: {
      id: true,
      tenantId: true,
      code: true,
      title: true,
      city: true,
      state: true,
      target: true,
      slug: true,
      salePrice: true,
      rentPrice: true,
    },
  });
  if (!property) {
    throw new AppError(404, "NOT_FOUND", "Imóvel não encontrado.");
  }
  return property;
}

/** Active endpoint list a REAL_ESTATE lead may be dispatched to (tenant-owned
 *  or platform-owned — never another subscriber's). */
async function resolveRealEstateEndpoints(tenantId: string) {
  return prismaUnscoped.webhookEndpoint.findMany({
    where: {
      isActive: true,
      scope: "REAL_ESTATE",
      OR: [{ tenantId: null }, { tenantId }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, baseUrl: true, timeoutMs: true },
  });
}

/** Resolve the external destination for a FINANCIAL lead via routing rules. */
async function resolveFinancialEndpoint(
  tenantId: string,
  profile: {
    city: string;
    state: string;
    monthlyIncome: number;
    propertyValue: number;
    termMonths: number;
  },
): Promise<{ endpoint: { id: string; name: string } | null; rule: RoutingCandidate | null }> {
  const rules = await prismaUnscoped.routingRule.findMany({
    where: { isActive: true, endpoint: { isActive: true } },
    include: { endpoint: { select: { id: true, name: true } } },
  });

  const candidates: RoutingCandidate[] = rules.map((r) => ({
    id: r.id,
    tenantId: r.tenantId,
    name: r.name,
    priority: r.priority,
    endpointId: r.endpointId,
    city: r.city,
    state: r.state,
    minMonthlyIncome: r.minMonthlyIncome?.toString() ?? null,
    maxMonthlyIncome: r.maxMonthlyIncome?.toString() ?? null,
    minPropertyValue: r.minPropertyValue?.toString() ?? null,
    maxPropertyValue: r.maxPropertyValue?.toString() ?? null,
    minTermMonths: r.minTermMonths,
    maxTermMonths: r.maxTermMonths,
  }));

  const matched = selectRoutingEndpoint(candidates, tenantId, {
    city: profile.city,
    state: profile.state,
    monthlyIncome: profile.monthlyIncome,
    propertyValue: profile.propertyValue,
    termMonths: profile.termMonths,
  });
  if (!matched) return { endpoint: null, rule: null };

  const endpointName = rules.find((r) => r.id === matched.id)?.endpoint.name ?? "external";
  return { endpoint: { id: matched.endpointId, name: endpointName }, rule: matched };
}

/**
 * Persist the durable delivery row (stable idempotency key) and enqueue the
 * transmission. Safe to call concurrently: (leadId, endpointId) is unique, so
 * a racing form submit only ever produces one delivery per endpoint.
 */
async function createDeliveryAndEnqueue(data: {
  tenantId: string;
  leadId: string;
  endpointId: string;
  endpointName: string;
  baseUrl: string;
  method: string;
  timeoutMs: number;
  matchedRuleId?: string | null;
}): Promise<DispatchResult> {
  const key = idempotencyKey({
    tenantId: data.tenantId,
    leadId: data.leadId,
    endpointId: data.endpointId,
  });

  const delivery = await prismaUnscoped.webhookDelivery.upsert({
    where: { leadId_endpointId: { leadId: data.leadId, endpointId: data.endpointId } },
    update: {},
    create: {
      tenantId: data.tenantId,
      leadId: data.leadId,
      endpointId: data.endpointId,
      idempotencyKey: key,
      status: "PENDING",
    },
  });

  const jobId = await QueueManager.addWebhookTransmission({
    tenantId: data.tenantId,
    integrationId: data.endpointId,
    eventId: `lead.created:${data.leadId}`,
    url: data.baseUrl,
    method: (data.method as "POST" | "PUT" | "PATCH") || "POST",
    headers: {},
    payload: {},
    timeoutMs: data.timeoutMs,
    deliveryId: delivery.id,
    attemptNumber: delivery.attemptsCount + 1,
  }).catch(() => null);

  return {
    deliveryId: delivery.id,
    jobId,
    endpointId: data.endpointId,
    endpointName: data.endpointName,
    matchedRuleId: data.matchedRuleId ?? null,
  };
}

async function persistConsent(data: {
  tenantId: string;
  leadId: string;
  textVersion: string;
  client: ClientMeta;
}): Promise<void> {
  const text = consentTextFor(data.textVersion);
  if (!text) {
    throw new AppError(
      400,
      "CONSENT_VERSION_UNKNOWN",
      `Versão de consentimento desconhecida: ${data.textVersion}.`,
    );
  }
  await prismaUnscoped.leadConsent.create({
    data: {
      tenantId: data.tenantId,
      leadId: data.leadId,
      textVersion: data.textVersion || CURRENT_CONSENT_VERSION,
      consentText: text,
      ipAddress: data.client.ipAddress ?? null,
      originUrl: data.client.originUrl ?? null,
      userAgent: data.client.userAgent ?? null,
    },
  });
}

export async function captureRealEstateLead(input: RealEstateLeadInput): Promise<LeadCaptureResult> {
  const property = await resolveVisibleProperty(input.propertyId);

  const type: Prisma.LeadCreateInput["type"] =
    input.message?.toLowerCase().includes("alugar") ? "RENTER" : "BUYER";
  const utm = Object.keys(input.utm).length > 0 ? { utm: input.utm } : {};
  const schedule = input.schedule?.date || input.schedule?.time ? { schedule: input.schedule } : {};

  const lead = await prismaUnscoped.lead.create({
    data: {
      tenantId: property.tenantId,
      propertyId: property.id,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      type,
      origin: "SITE_FORM",
      status: "NEW",
      payload: {
        property: { id: property.id, code: property.code, title: property.title },
        message: input.message ?? null,
        source: "portal",
        ...utm,
        ...schedule,
      },
    } as Prisma.LeadUncheckedCreateInput,
  });

  await persistConsent({
    tenantId: property.tenantId,
    leadId: lead.id,
    textVersion: input.consentTextVersion,
    client: input.client,
  });

  // Internal routing (async enrichment in the tenant context).
  await QueueManager.addLeadRouting({ tenantId: property.tenantId, leadId: lead.id }).catch(() => null);

  // External dispatch — any ACTIVE REAL_ESTATE endpoint scoped to this tenant
  // or to the platform.
  const endpoints = await resolveRealEstateEndpoints(property.tenantId);
  const deliveries: DispatchResult[] = [];
  for (const endpoint of endpoints) {
    deliveries.push(
      await createDeliveryAndEnqueue({
        tenantId: property.tenantId,
        leadId: lead.id,
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        baseUrl: endpoint.baseUrl,
        method: "POST",
        timeoutMs: endpoint.timeoutMs,
      }),
    );
  }

  AuditService.logAsync({
    action: AUDIT_ACTIONS.LEAD_CREATED,
    entity: "Lead",
    entityId: lead.id,
    tenantId: property.tenantId,
    userId: null,
    details: {
      name: lead.name,
      origin: "SITE_FORM",
      propertyId: property.id,
      deliveries: deliveries.map((d) => d.deliveryId),
    },
  });

  // Phase 6 — transactional e-mails (async, best-effort): new-lead alert to the
  // tenant OWNER(s), plus a targeted visit-request e-mail when the lead asked
  // for an appointment (schedule present in the captured payload).
  const capturedPayload = (lead.payload ?? {}) as Record<string, unknown>;
  const capturedSchedule = asRecord(capturedPayload.schedule);
  const tenantName =
    (await prismaUnscoped.tenant.findUnique({
      where: { id: property.tenantId },
      select: { name: true },
    }))?.name ?? "";
  const leadMeta = {
    tenantName,
    leadName: lead.name,
    leadEmail: lead.email,
    leadPhone: lead.phone,
    message: (capturedPayload.message as string | null) ?? null,
    propertyTitle: property.title,
    propertyUrl: `${env.APP_URL}/imovel/${property.slug ?? property.id}`,
    appUrl: env.APP_URL,
  };
  await notifyNewLeadAlert(property.tenantId, leadMeta).catch(() => undefined);
  if (
    capturedSchedule &&
    (typeof capturedSchedule.date === "string" || typeof capturedSchedule.time === "string")
  ) {
    await notifyVisitRequest(property.tenantId, {
      ...leadMeta,
      scheduleDate: typeof capturedSchedule.date === "string" ? capturedSchedule.date : null,
      scheduleTime: typeof capturedSchedule.time === "string" ? capturedSchedule.time : null,
    }).catch(() => undefined);
  }

  return {
    leadId: lead.id,
    type: "REAL_ESTATE",
    tenantId: property.tenantId,
    routing: deliveries.length > 0 ? "external" : "internal",
    deliveries,
  };
}

export async function captureFinancialLead(input: FinancialLeadInput): Promise<LeadCaptureResult> {
  // Multi-tenant scoping: derive the owning tenant from a listing or slug. A
  // financial lead is NEVER tenant-less (isolation by construction).
  let tenantId: string | null = null;
  if (input.propertyId) {
    const property = await resolveVisibleProperty(input.propertyId);
    tenantId = property.tenantId;
  } else if (input.tenantSlug) {
    const tenant = await prismaUnscoped.tenant.findFirst({
      where: { slug: input.tenantSlug, status: "ACTIVE" },
      select: { id: true },
    });
    if (tenant) tenantId = tenant.id;
  }
  if (!tenantId) {
    throw new AppError(
      404,
      "NOT_FOUND",
      "Não foi possível identificar o contexto do imóvel para esta solicitação.",
    );
  }

  const financingAmount =
    input.financingAmount ?? Math.max(0, input.propertyValue - input.downPayment);

  const lead = await prismaUnscoped.lead.create({
    data: {
      tenantId,
      type: "FINANCIAL",
      origin: "SITE_FORM",
      status: "NEW",
      name: input.name,
      email: input.email,
      phone: input.phone,
      payload: { utm: input.utm, source: "portal-financing" },
      financeProfile: {
        create: {
          tenantId,
          propertyValue: input.propertyValue,
          downPayment: input.downPayment,
          financingAmount,
          monthlyIncome: input.monthlyIncome,
          monthlyInstallmentLimit: input.monthlyInstallmentLimit,
          termMonths: input.termMonths,
          city: input.city,
          state: input.state,
        },
      },
    },
  });

  await persistConsent({
    tenantId,
    leadId: lead.id,
    textVersion: input.consentTextVersion,
    client: input.client,
  });

  // Internal enrichment (tenant context).
  await QueueManager.addLeadRouting({ tenantId, leadId: lead.id }).catch(() => null);

  // External dispatch — first matching routing rule wins (tenant rules first,
  // then platform defaults). No match => the lead stays internal.
  const { endpoint, rule } = await resolveFinancialEndpoint(tenantId, {
    city: input.city,
    state: input.state,
    monthlyIncome: input.monthlyIncome,
    propertyValue: input.propertyValue,
    termMonths: input.termMonths,
  });

  const deliveries: DispatchResult[] = [];
  if (endpoint) {
    const ep = await prismaUnscoped.webhookEndpoint.findUnique({
      where: { id: endpoint.id },
      select: { baseUrl: true, timeoutMs: true },
    });
    deliveries.push(
      await createDeliveryAndEnqueue({
        tenantId,
        leadId: lead.id,
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        baseUrl: ep?.baseUrl ?? "",
        method: "POST",
        timeoutMs: ep?.timeoutMs ?? 10_000,
        matchedRuleId: rule?.id ?? null,
      }),
    );
  }

  AuditService.logAsync({
    action: AUDIT_ACTIONS.LEAD_CREATED,
    entity: "Lead",
    entityId: lead.id,
    tenantId,
    userId: null,
    details: {
      name: lead.name,
      origin: "SITE_FORM",
      type: "FINANCIAL",
      matchedRule: rule?.name ?? null,
      deliveries: deliveries.map((d) => d.deliveryId),
    },
  });

  return {
    leadId: lead.id,
    type: "FINANCIAL",
    tenantId,
    routing: deliveries.length > 0 ? "external" : "internal",
    deliveries,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}