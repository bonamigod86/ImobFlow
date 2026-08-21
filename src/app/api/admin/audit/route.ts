import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";
import { queryPageSchema } from "@/lib/validation/schemas";

/**
 * GET /api/admin/audit  (MASTER-only)
 * Audit log browsing (Checklist Item 24) — every critical/administrative
 * mutation is persisted to `AuditLog`. Supports pagination and filters by
 * action, entity, free-text (tenant slug / actor e-mail / entity id) and a
 * createdAt window.
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async (_ctx, req) => {
  const qs = Object.fromEntries(new URL(req.url).searchParams);
  const { page, pageSize } = queryPageSchema.parse(qs);

  const action = qs.action?.trim();
  const entity = qs.entity?.trim();
  const q = qs.q?.trim().toLowerCase();
  const from = qs.from ? new Date(qs.from) : undefined;
  const to = qs.to ? new Date(qs.to) : undefined;

  const where: Prisma.AuditLogWhereInput = {
    AND: [
      action ? { action } : {},
      entity ? { entity } : {},
      from || to ? { createdAt: { gte: from, lte: to } } : {},
      q
        ? {
            OR: [
              { tenant: { is: { slug: { contains: q, mode: "insensitive" } } } },
              { user: { is: { email: { contains: q, mode: "insensitive" } } } },
              { entityId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };

  const [items, total] = await prismaUnscoped.$transaction([
    prismaUnscoped.auditLog.findMany({
      where,
      include: { user: { select: { email: true, name: true } }, tenant: { select: { slug: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prismaUnscoped.auditLog.count({ where }),
  ]);

  const rows = items.map((a) => ({
    id: a.id,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    actorEmail: a.user?.email ?? null,
    actorName: a.user?.name ?? null,
    tenantSlug: a.tenant?.slug ?? null,
    details: a.details as Record<string, unknown> | null,
    ipAddress: a.ipAddress,
    createdAt: a.createdAt.toISOString(),
  }));

  return ok({ items: rows, pagination: { page, pageSize, total } });
});