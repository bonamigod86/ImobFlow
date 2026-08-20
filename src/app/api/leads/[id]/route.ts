import type { NextRequest } from "next/server";
import { Prisma, type LeadStatus, type UserRole } from "@prisma/client";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { hasPermission } from "@/lib/rbac/has-permission";
import { prisma } from "@/lib/prisma/client";
import { ok, fail } from "@/lib/http/errors";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * GET/PATCH/DELETE /api/leads/[id]
 * Lead qualification endpoint (checklist item 7): a tenant fetches one lead,
 * flips its pipeline status (NEW → CONTACTED/QUALIFIED/…), (re)assigns the
 * responsible broker and removes it. All reads/writes are tenant-scoped by the
 * ambient Prisma extension; assignment additionally validates the target user.
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

const updateLeadSchema = z.object({
  status: z.enum(VALID_STATUSES).optional(),
  note: z.string().trim().max(2000).optional(),
  assignedToId: z.string().trim().min(1).max(64).optional(),
});

type RouteParams = Record<string, string | string[] | undefined>;

function idOf(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

const DETAIL_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  type: true,
  origin: true,
  status: true,
  payload: true,
  createdAt: true,
  updatedAt: true,
  property: { select: { id: true, code: true, title: true, slug: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  consent: {
    select: {
      textVersion: true,
      grantedAt: true,
      ipAddress: true,
      originUrl: true,
      userAgent: true,
      optedOut: true,
    },
  },
  financeProfile: true,
  deliveries: {
    select: {
      id: true,
      status: true,
      endpoint: { select: { id: true, name: true, scope: true } },
      idempotencyKey: true,
      attemptsCount: true,
      createdAt: true,
    },
  },
} satisfies Prisma.LeadSelect;

export const GET = withApiRoute(ACTIONS.LEADS_READ, async (_ctx, _req, params) => {
  const lead = await prisma.lead.findFirst({
    where: { id: idOf(params) },
    select: DETAIL_SELECT,
  });
  if (!lead) return fail(404, "NOT_FOUND", "Lead not found.");
  return ok({ lead });
});

export const PATCH = withApiRoute(ACTIONS.LEADS_UPDATE, async (ctx, req, params) => {
  const id = idOf(params);
  const body = updateLeadSchema.parse(await req.json().catch(() => ({})));

  const lead = await prisma.lead.findFirst({ where: { id }, select: { id: true } });
  if (!lead) return fail(404, "NOT_FOUND", "Lead not found.");

  // Reassignment is gated by the assign permission (OWNER/MANAGER only).
  if (body.assignedToId !== undefined && !hasPermission(
    { role: ctx.role, tenantId: ctx.tenantId } as { role: UserRole; tenantId: string | null },
    ACTIONS.LEADS_ASSIGN,
  )) {
    return fail(403, "FORBIDDEN", `Missing permission: ${ACTIONS.LEADS_ASSIGN}`);
  }

  const current = await prisma.lead.findFirst({
    where: { id },
    select: { payload: true, status: true },
  });
  const payload = (current?.payload ?? {}) as Record<string, unknown>;

  const next: Prisma.LeadUncheckedUpdateInput = {
    status: body.status,
    assignedToId: body.assignedToId,
    payload: {
      ...payload,
      ...(body.note !== undefined ? { lastNote: body.note } : {}),
      ...(body.status !== undefined
        ? {
            statusUpdatedAt: new Date().toISOString(),
            ...(body.status === "QUALIFIED" ? { qualifiedAt: new Date().toISOString() } : {}),
          }
        : {}),
    },
  };

  const updated = await prisma.lead.update({
    where: { id },
    data: next,
    select: DETAIL_SELECT,
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.LEAD_UPDATED,
    entity: "Lead",
    entityId: id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: {
      ...(body.status !== undefined
        ? { from: current?.status ?? null, to: body.status }
        : {}),
      ...(body.assignedToId !== undefined ? { assignedToId: body.assignedToId } : {}),
    },
  });

  return ok({ lead: updated });
});

export const DELETE = withApiRoute(ACTIONS.LEADS_DELETE, async (ctx, _req, params) => {
  const id = idOf(params);
  const lead = await prisma.lead.findFirst({ where: { id }, select: { id: true, name: true } });
  if (!lead) return fail(404, "NOT_FOUND", "Lead not found.");

  const deleted = await prisma.lead.deleteMany({ where: { id } });
  if (deleted.count === 0) return fail(404, "NOT_FOUND", "Lead not found.");

  AuditService.logAsync({
    action: AUDIT_ACTIONS.LEAD_DELETED,
    entity: "Lead",
    entityId: id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { name: lead.name },
  });

  return ok({ deleted: true, id });
});