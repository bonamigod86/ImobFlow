import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { webhookEndpointPatchSchema } from "@/lib/validation/schemas";
import { encryptSecret } from "@/lib/crypto/secrets";
import { prismaUnscoped } from "@/lib/prisma/client";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { ok, fail } from "@/lib/http/errors";

/**
 * PATCH /api/webhook-endpoints/[id]
 * Update an endpoint owned by the calling tenant (or any endpoint for MASTER).
 */
export const PATCH = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, req, params) => {
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id) return fail(400, "BAD_REQUEST", "Endpoint id is required.");
  const body = webhookEndpointPatchSchema.parse(await req.json());

  const existing = await assertOwnership(id, ctx.tenantId, ctx.role);
  if (!existing) return fail(404, "NOT_FOUND", "Endpoint não encontrado.");

  const endpoint = await prismaUnscoped.webhookEndpoint.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.strategy !== undefined ? { strategy: body.strategy } : {}),
      ...(body.scope !== undefined ? { scope: body.scope } : {}),
      ...(body.baseUrl !== undefined ? { baseUrl: body.baseUrl } : {}),
      ...(body.method !== undefined ? { method: body.method } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.timeoutMs !== undefined ? { timeoutMs: body.timeoutMs } : {}),
      ...(body.secret !== undefined ? { hmacSecret: encryptSecret(body.secret) } : {}),
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      strategy: true,
      scope: true,
      baseUrl: true,
      method: true,
      isActive: true,
      timeoutMs: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.ENDPOINT_UPDATED,
    entity: "WebhookEndpoint",
    entityId: endpoint.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { name: endpoint.name, secretRotated: body.secret !== undefined },
  });

  return ok({ endpoint });
});

/**
 * DELETE /api/webhook-endpoints/[id]
 * Soft-deactivate (endpoints referenced by past deliveries must never be
 * hard-deleted — their attempt logs remain the audit trail).
 */
export const DELETE = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, _req, params) => {
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!id) return fail(400, "BAD_REQUEST", "Endpoint id is required.");
  const existing = await assertOwnership(id, ctx.tenantId, ctx.role);
  if (!existing) return fail(404, "NOT_FOUND", "Endpoint não encontrado.");

  const endpoint = await prismaUnscoped.webhookEndpoint.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, name: true, isActive: true },
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.ENDPOINT_DEACTIVATED,
    entity: "WebhookEndpoint",
    entityId: endpoint.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { name: endpoint.name },
  });

  return ok({ endpoint });
});

/** Ownership check: tenants can only touch rows owned by them; MASTER all. */
async function assertOwnership(
  id: string,
  tenantId: string | null,
  role: string,
): Promise<{ id: string; tenantId: string | null } | null> {
  const endpoint = await prismaUnscoped.webhookEndpoint.findUnique({
    where: { id },
    select: { id: true, tenantId: true },
  });
  if (!endpoint) return null;
  if (role === "MASTER") return endpoint;
  if (endpoint.tenantId !== tenantId) return null;
  return endpoint;
}