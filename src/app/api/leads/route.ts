import type { NextRequest } from "next/server";
import { Prisma, type LeadStatus, type LeadType } from "@prisma/client";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { leadSchema, queryPageSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/prisma/client";
import { ok } from "@/lib/http/errors";
import { QueueManager } from "@/lib/queues/queue-manager";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * GET/POST /api/leads
 * Tenant-isolated lead collection + capture. A captured lead is enqueued on
 * the lead-routing queue for asynchronous enrichment (resilient, retried).
 */

const VALID_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

const VALID_TYPES = ["BUYER", "SELLER", "RENTER", "INVESTOR", "FINANCIAL"] as const;

export const GET = withApiRoute(ACTIONS.LEADS_READ, async (_ctx, req) => {
  const { page, pageSize } = queryPageSchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  const qs = Object.fromEntries(new URL(req.url).searchParams);
  const statusRaw = qs.status ?? undefined;
  const typeRaw = qs.type ?? undefined;
  const status = VALID_STATUSES.includes(statusRaw as LeadStatus)
    ? (statusRaw as LeadStatus)
    : undefined;
  const type = VALID_TYPES.includes(typeRaw as LeadType) ? (typeRaw as LeadType) : undefined;

  const where: Prisma.LeadWhereInput = { ...(status ? { status } : {}), ...(type ? { type } : {}) };
  const [items, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        type: true,
        origin: true,
        status: true,
        payload: true,
        createdAt: true,
        financeProfile: {
          select: {
            propertyValue: true,
            downPayment: true,
            financingAmount: true,
            monthlyIncome: true,
            monthlyInstallmentLimit: true,
            termMonths: true,
            city: true,
            state: true,
          },
        },
        consent: { select: { textVersion: true, optedOut: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);

  return ok({ items, pagination: { page, pageSize, total } });
});

export const POST = withApiRoute(ACTIONS.LEADS_CREATE, async (ctx, req) => {
  const body = leadSchema.parse(await req.json());

  const lead = await prisma.lead.create({
    data: {
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      type: body.type,
      origin: body.origin,
      payload: body.payload,
    } as Prisma.LeadUncheckedCreateInput,
  });

  // Async enrichment with idempotency (same lead can't be re-queued).
  const jobId = await QueueManager.addLeadRouting({
    tenantId: ctx.tenantId!,
    leadId: lead.id,
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.LEAD_CREATED,
    entity: "Lead",
    entityId: lead.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { name: lead.name, origin: lead.origin, type: lead.type, jobId },
  });

  return ok({ lead, jobId }, 201);
});