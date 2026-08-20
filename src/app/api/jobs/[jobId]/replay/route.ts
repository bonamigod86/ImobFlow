import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { DeadLetterQueue } from "@/lib/queues/dlq";
import { ok, fail } from "@/lib/http/errors";
import { QueueName, type QueueName as QueueNameType } from "@/lib/queues/names";

/**
 * POST /api/jobs/[jobId]/replay
 * Replay a parked DLQ job back into its original queue. Access is restricted
 * to integrations/delivery managers (MASTER/OWNER/MANAGER via RBAC).
 */

type Params = { params: { jobId: string } };

const QUEUE_BY_NAME: Record<string, QueueNameType> = {
  [QueueName.LEAD_ROUTING]: QueueName.LEAD_ROUTING,
  [QueueName.WEBHOOK_TRANSMISSION]: QueueName.WEBHOOK_TRANSMISSION,
  [QueueName.PROPERTY_IMPORT]: QueueName.PROPERTY_IMPORT,
  [QueueName.MEDIA_PROCESSING]: QueueName.MEDIA_PROCESSING,
};

export const POST = withApiRoute(ACTIONS.INTEGRATIONS_MANAGE, async (ctx, req, params) => {
  const dlqJobId = Array.isArray(params.jobId) ? params.jobId[0] : params.jobId;
  if (!dlqJobId) return fail(400, "BAD_REQUEST", "dlq jobId is required.");

  const body = await req.json().catch(() => ({}));
  const originalQueue = QUEUE_BY_NAME[body.queueName as string];
  if (!originalQueue) {
    return fail(400, "BAD_REQUEST", "Unknown queueName. Use one of: lead-routing-queue, webhook-transmission-queue, property-import-queue, media-processing-queue.");
  }

  // Ensure the parked meta belongs to the requesting tenant before replay.
  const dlq = DeadLetterQueue.queueFor(originalQueue);
  const parked = await dlq.getJob(dlqJobId);
  const payload = parked?.data as { data?: { tenantId?: string } } | undefined;
  if (!parked || payload?.data?.tenantId !== ctx.tenantId) {
    return fail(404, "NOT_FOUND", "DLQ job not found.");
  }

  const newJobId = await DeadLetterQueue.replay(originalQueue, dlqJobId);
  if (!newJobId) return fail(404, "NOT_FOUND", "DLQ job not found.");

  return ok({ replayedTo: originalQueue, newJobId });
});