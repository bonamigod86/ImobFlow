import "dotenv/config";
import { Worker, type Job } from "bullmq";
import { redisBull } from "@/lib/redis/client";
import { QueueName } from "@/lib/queues/names";
import type { LeadRoutingJobData } from "@/lib/queues/types";
import { withTenantContext } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma/client";
import { routeTier, type RoutingTier } from "@/lib/queues/routing";
import { attachWorkerObservability, isStandaloneEntry } from "@/workers/helpers";
import "../lib/events/register";

/**
 * lead-routing-queue worker.
 *
 * Consumes freshly captured leads and enriches them asynchronously:
 *   lookup tenant-owned lead -> score/suggest owner by origin & type ->
 *   stamp routing metadata into `payload` -> transition status.
 *
 * Assignment rule (multi-tenant isolation): the assignee is ALWAYS the lead's
 * own tenant OWNER (their dashboard). A FINANCIAL lead is dispatched to the
 * external partner by the routing rules — no internal assignee is needed, so
 * `assignedTo` is left untouched for those.
 *
 * Runs inside the job's tenant context, so every Prisma call below is
 * automatically scoped by the tenant-extension.
 */

async function processLeadRouting(job: Job<LeadRoutingJobData>): Promise<{
  leadId: string;
  tier: RoutingTier;
  assignedTo: string | null;
}> {
  const { tenantId, leadId } = job.data;

  return withTenantContext(
    { tenantId, tenantSlug: null, userId: null, role: null },
    async () => {
      await job.updateProgress(10);

      const lead = await prisma.lead.findFirst({ where: { id: leadId } });
      if (!lead) {
        // A missing lead is a permanent, non-retryable condition for routing.
        throw new Error(`Lead ${leadId} not found for tenant ${tenantId}.`);
      }

      await job.updateProgress(50);

      const tier = routeTier(lead.origin);
      const existingPayload = (lead.payload ?? {}) as Record<string, unknown>;
      const isFinancial = lead.type === "FINANCIAL";

      // Internal assignment for real-estate leads only: the tenant OWNER acts
      // as the receiving agent on their dashboard. Never cross-tenant.
      let assignedTo: string | null = null;
      if (!isFinancial) {
        const owner = await prisma.user.findFirst({
          where: { role: "OWNER", isActive: true },
          select: { id: true },
        });
        assignedTo = owner?.id ?? null;
      }

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: "CONTACTED",
          payload: {
            ...existingPayload,
            routing: {
              tier,
              target: isFinancial ? "partner" : "tenant",
              assignedTo,
              routedAt: new Date().toISOString(),
              processedByWorker: `worker:${process.pid}`,
            },
          },
        },
      });

      // Keep the assignee in its dedicated column (queryable, indexed).
      if (assignedTo) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { assignedToId: assignedTo },
        });
      }

      await job.updateProgress(100);
      return { leadId, tier, assignedTo };
    },
  );
}

export function createLeadRoutingWorker(): Worker {
  const worker = new Worker<LeadRoutingJobData>(QueueName.LEAD_ROUTING, processLeadRouting, {
    connection: redisBull,
    concurrency: 5,
  });
  attachWorkerObservability(worker, QueueName.LEAD_ROUTING);
  return worker;
}

// Allow direct execution: `tsx src/workers/lead-routing.worker.ts`
if (isStandaloneEntry("workers/lead-routing.worker.ts")) {
  const worker = createLeadRoutingWorker();
  console.info(`[worker:${QueueName.LEAD_ROUTING}] started`);

  const shutdown = async () => {
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}