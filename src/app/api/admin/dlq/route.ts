import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { DeadLetterQueue } from "@/lib/queues/dlq";
import { QueueName, type QueueName as QueueNameType } from "@/lib/queues/names";
import { ok, fail } from "@/lib/http/errors";

/**
 * GET /api/admin/dlq?queueName=<queue>
 * List parked (dead-lettered) jobs for the given queue. Tenants only ever see
 * their own payloads; MASTER sees everything.
 */

const QUEUES: Record<string, QueueNameType> = {
  [QueueName.WEBHOOK_TRANSMISSION]: QueueName.WEBHOOK_TRANSMISSION,
  [QueueName.LEAD_ROUTING]: QueueName.LEAD_ROUTING,
  [QueueName.MEDIA_PROCESSING]: QueueName.MEDIA_PROCESSING,
  [QueueName.PROPERTY_IMPORT]: QueueName.PROPERTY_IMPORT,
};

export const GET = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, req) => {
  const queueName = new URL(req.url).searchParams.get("queueName") ?? "";
  const queue = QUEUES[queueName];
  if (!queue) {
    return fail(
      400,
      "BAD_REQUEST",
      `Unknown queueName. Use one of: ${Object.values(QueueName).join(", ")}`,
    );
  }

  const parked = await DeadLetterQueue.list(queue);
  const ownPayload = parked.filter((p) => {
    if (ctx.tenantId === null) return true; // MASTER — all payloads
    const payload = p.meta.data as { tenantId?: string } | undefined;
    return payload?.tenantId === ctx.tenantId;
  });

  return ok({
    queueName: queue,
    items: ownPayload.map((p) => ({
      jobId: p.jobId,
      originalJobId: p.meta.originalJobId,
      error: p.meta.error,
      attemptsMade: p.meta.attemptsMade,
      parkedAt: p.meta.parkedAt,
      replayedAt: p.replayedAt,
      originalQueue: p.meta.originalQueue,
      tenantId: (p.meta.data as { tenantId?: string } | undefined)?.tenantId ?? null,
    })),
  });
});