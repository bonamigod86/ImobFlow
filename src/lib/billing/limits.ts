import { prismaUnscoped } from "@/lib/prisma/client";
import { AppError } from "@/lib/http/errors";

/**
 * Plan entitlement enforcement (checklist item 12).
 *
 * `Plan.maxProperties`/`maxUsers`/`maxLeads` are ceiling boundaries an admin
 * configures per plan. This module turns the stored value into an actual
 * write guard so quotas are enforced, not just displayed.
 *
 * Concurrency note: guards perform an exact COUNT before an insert. Under
 * bursts of concurrent creates two requests can both pass the check and
 * overshoot by one — an acceptable soft-cap for catalogue limits.
 */

export class PlanLimitReachedError extends AppError {
  constructor(limit: string, current: number, cap: number) {
    super(403, "PLAN_LIMIT_REACHED", `Limite do plano atingido: ${limit} (${current}/${cap}).`);
    this.name = "PlanLimitReachedError";
  }
}

export interface PlanUsage {
  cap: number | null;
  current: number;
}

/** Property usage vs the tenant's effective plan cap (NULL cap = unlimited). */
export async function propertyUsage(tenantId: string): Promise<PlanUsage> {
  const tenant = await prismaUnscoped.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: { select: { maxProperties: true } } },
  });
  const cap = tenant?.plan?.maxProperties ?? null;
  const current = await prismaUnscoped.property.count({ where: { tenantId } });
  return { cap, current };
}

/** Throw `PlanLimitReachedError` when the tenant cannot host another property. */
export async function assertPropertyCreationAllowed(tenantId: string): Promise<void> {
  const { cap, current } = await propertyUsage(tenantId);
  if (cap !== null && current >= cap) {
    throw new PlanLimitReachedError("imóveis", current, cap);
  }
}