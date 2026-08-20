import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { webhookEndpointSchema } from "@/lib/validation/schemas";
import { encryptSecret } from "@/lib/crypto/secrets";
import { prismaUnscoped } from "@/lib/prisma/client";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { ok } from "@/lib/http/errors";

/**
 * GET /api/webhook-endpoints
 * List webhook destinations visible in the current context:
 *   - tenant (OWNER/MANAGER): their own endpoints + platform-owned ones
 *   - MASTER: every endpoint
 * HMAC secrets are NEVER serialized.
 */
export const GET = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx) => {
  const where =
    ctx.tenantId === null
      ? {}
      : { OR: [{ tenantId: null }, { tenantId: ctx.tenantId }] };

  const items = await prismaUnscoped.webhookEndpoint.findMany({
    where,
    orderBy: [{ tenantId: "asc" }, { createdAt: "desc" }],
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
      _count: { select: { routingRules: true, deliveries: true } },
    },
  });

  return ok({ items });
});

/**
 * POST /api/webhook-endpoints
 * Create a destination endpoint. Owned by the calling tenant, or by the
 * platform when the caller is MASTER. `secret` is encrypted at rest.
 */
export const POST = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, req) => {
  const body = webhookEndpointSchema.parse(await req.json());

  const endpoint = await prismaUnscoped.webhookEndpoint.create({
    data: {
      tenantId: ctx.tenantId,
      name: body.name,
      strategy: body.strategy,
      scope: body.scope,
      baseUrl: body.baseUrl,
      method: body.method,
      hmacSecret: body.secret ? encryptSecret(body.secret) : null,
      isActive: body.isActive,
      timeoutMs: body.timeoutMs,
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
    },
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.ENDPOINT_CREATED,
    entity: "WebhookEndpoint",
    entityId: endpoint.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { name: endpoint.name, strategy: endpoint.strategy },
  });

  return ok({ endpoint }, 201);
});