import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { QueueManager } from "@/lib/queues/queue-manager";
import { QueueName } from "@/lib/queues/names";
import type { JobData } from "@/lib/queues/types";

/**
 * GET /api/jobs/[jobId] — queue observability for the ACTIVE tenant.
 * Returns the BullMQ job state/progress/attempts when the job belongs to the
 * requesting tenant (guards cross-tenant reads via job.data.tenantId).
 *
 * jobId format:  lead-routing:<leadId>  |  webhook:<integrationId>:<eventId>
 */

type Params = { params: { id: string } };

export const GET = withApiRoute(ACTIONS.LEADS_READ, async (ctx, _req, params) => {
  const jobId = Array.isArray(params.id) ? params.id[0] : params.id;
  if (!jobId) return fail(400, "BAD_REQUEST", "jobId is required.");

  const queueName =
    jobId.startsWith("webhook:") ? QueueName.WEBHOOK_TRANSMISSION : QueueName.LEAD_ROUTING;

  const queue = QueueManager.get<JobData>(queueName);
  const job = await queue.getJob(jobId);

  // Tenant jobs must carry the requesting tenant id. Platform-level jobs
  // (e.g. billing sync) are never exposed through this endpoint.
  const tenantId = (job?.data as { tenantId?: string } | undefined)?.tenantId;
  // Not found OR belongs to another tenant → 404 (no existence leak).
  if (!job || tenantId !== ctx.tenantId) {
    return fail(404, "NOT_FOUND", "Job not found.");
  }

  const state = await job.getState();

  return ok({
    jobId: job.id,
    queueName,
    state,
    attemptsMade: job.attemptsMade,
    attempts: job.opts.attempts,
    progress: job.progress,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
    failedReason: job.failedReason ?? null,
    parent: job.parent?.id ?? null,
  });
});