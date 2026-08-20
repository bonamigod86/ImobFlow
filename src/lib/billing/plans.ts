import type { BillingCycle, Plan, Prisma } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { AppError } from "@/lib/http/errors";
import type { PlanDefinition } from "@/lib/billing/types";
import "../events/register";

/**
 * Plan catalogue (Master-Admin managed).
 *
 * Plans are the pricing skeleton of the platform. `features` (Phase 2) keeps
 * the legacy quota shape; Phase 5 mirrors it into explicit columns
 * (maxProperties, maxUsers, maxLeads, highlightCredits, gracePeriodDays,
 * trialDays) that the billing engine actually consumes. All prices are integer
 * cents. Deactivating a plan never touches live subscriptions — only new
 * signups stop referencing it.
 */

export type PlanCreateInput = Omit<
  PlanDefinition,
  "code" | "billingCycle"
> & {
  code: string;
  billingCycle: BillingCycle;
};

function toDefinition(plan: Plan): PlanDefinition {
  return {
    code: plan.code,
    name: plan.name,
    description: plan.description,
    priceCents: plan.priceCents,
    billingCycle: plan.billingCycle,
    maxProperties: plan.maxProperties,
    maxUsers: plan.maxUsers,
    maxLeads: plan.maxLeads,
    highlightCredits: plan.highlightCredits,
    gracePeriodDays: plan.gracePeriodDays,
    trialDays: plan.trialDays,
    isActive: plan.isActive,
  };
}

/** Shared scalar guards so every plan write enforces the same invariants. */
function assertPlanScalars(input: {
  priceCents?: number;
  highlightCredits?: number;
  gracePeriodDays?: number;
  trialDays?: number;
}): void {
  if (input.priceCents !== undefined && (!Number.isInteger(input.priceCents) || input.priceCents < 0)) {
    throw new AppError(400, "INVALID_PRICE", "O preço deve ser um valor inteiro em centavos.");
  }
  if (
    input.highlightCredits !== undefined &&
    (!Number.isInteger(input.highlightCredits) || input.highlightCredits < 0)
  ) {
    throw new AppError(400, "INVALID_CREDITS", "highlightCredits deve ser um inteiro >= 0.");
  }
  if (
    input.gracePeriodDays !== undefined &&
    (!Number.isInteger(input.gracePeriodDays) || input.gracePeriodDays < 0 || input.gracePeriodDays > 365)
  ) {
    throw new AppError(400, "INVALID_GRACE", "gracePeriodDays deve ser um inteiro entre 0 e 365.");
  }
  if (
    input.trialDays !== undefined &&
    (!Number.isInteger(input.trialDays) || input.trialDays < 0 || input.trialDays > 365)
  ) {
    throw new AppError(400, "INVALID_TRIAL", "trialDays deve ser um inteiro entre 0 e 365.");
  }
}

export async function listPlans(input: { includeInactive?: boolean } = {}): Promise<PlanDefinition[]> {
  const plans = await prismaUnscoped.plan.findMany({
    where: input.includeInactive ? undefined : { isActive: true },
    orderBy: [{ priceCents: "asc" }, { code: "asc" }],
  });
  return plans.map(toDefinition);
}

/**
 * Create a brand-new plan (configurable catalogue — no code changes needed).
 * `code` is the immutable identifier used by rules/provisioning/tests.
 */
export async function createPlan(input: PlanCreateInput): Promise<PlanDefinition> {
  assertPlanScalars(input);

  const features: Record<string, unknown> = {};
  if (input.maxProperties !== undefined) features.maxProperties = input.maxProperties;
  if (input.maxUsers !== undefined) features.maxUsers = input.maxUsers;
  if (input.maxLeads !== undefined) features.maxLeads = input.maxLeads;

  const plan = await prismaUnscoped.plan.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      priceCents: input.priceCents ?? 0,
      billingCycle: input.billingCycle ?? "MONTHLY",
      maxProperties: input.maxProperties ?? null,
      maxUsers: input.maxUsers ?? null,
      maxLeads: input.maxLeads ?? null,
      highlightCredits: input.highlightCredits ?? 0,
      gracePeriodDays: input.gracePeriodDays ?? 5,
      trialDays: input.trialDays ?? 14,
      isActive: input.isActive ?? true,
      features: features as Prisma.InputJsonValue,
    },
  });

  return toDefinition(plan);
}

export async function updatePlanFromDefinition(
  code: string,
  input: Partial<PlanDefinition>,
): Promise<PlanDefinition> {
  const plan = await prismaUnscoped.plan.findUnique({ where: { code } });
  if (!plan) {
    throw new AppError(404, "PLAN_NOT_FOUND", `Plano "${code}" não encontrado.`);
  }

  assertPlanScalars(input);

  const features: Record<string, unknown> = (plan.features as Record<string, unknown>) ?? {};
  const updated = await prismaUnscoped.plan.update({
    where: { code },
    data: {
      name: input.name ?? plan.name,
      description: input.description !== undefined ? input.description : plan.description,
      priceCents: input.priceCents ?? plan.priceCents,
      billingCycle: input.billingCycle ?? plan.billingCycle,
      maxProperties: input.maxProperties ?? plan.maxProperties,
      maxUsers: input.maxUsers ?? plan.maxUsers,
      maxLeads: input.maxLeads ?? plan.maxLeads,
      highlightCredits: input.highlightCredits ?? plan.highlightCredits,
      gracePeriodDays: input.gracePeriodDays ?? plan.gracePeriodDays,
      trialDays: input.trialDays ?? plan.trialDays,
      isActive: input.isActive ?? plan.isActive,
      features: {
        ...features,
        ...(input.maxProperties !== undefined ? { maxProperties: input.maxProperties } : {}),
        ...(input.maxUsers !== undefined ? { maxUsers: input.maxUsers } : {}),
        ...(input.maxLeads !== undefined ? { maxLeads: input.maxLeads } : {}),
      },
    },
  });

  return toDefinition(updated);
}

export async function setPlanActive(code: string, isActive: boolean): Promise<PlanDefinition> {
  const plan = await prismaUnscoped.plan.update({
    where: { code },
    data: { isActive },
  });
  return toDefinition(plan);
}