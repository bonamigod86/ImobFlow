import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { updatePlanFromDefinition } from "@/lib/billing/plans";

/**
 * PATCH /api/admin/billing/plans/[code]  (MASTER-only)
 * Edit pricing/limits of a plan. Prices in integer cents. Deactivating a plan
 * never touches live subscriptions — only new signups stop referencing it.
 */

const planPatchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(400).nullable().optional(),
    priceCents: z.number().int().min(0).optional(),
    billingCycle: z.enum(["MONTHLY", "YEARLY"]).optional(),
    maxProperties: z.number().int().min(0).nullable().optional(),
    maxUsers: z.number().int().min(0).nullable().optional(),
    maxLeads: z.number().int().min(0).nullable().optional(),
    highlightCredits: z.number().int().min(0).optional(),
    gracePeriodDays: z.number().int().min(0).max(365).optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const PATCH = withApiRoute(ACTIONS.BILLING_ADMIN, async (ctx, req, params) => {
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  const body = planPatchSchema.parse(await req.json());
  const plan = await updatePlanFromDefinition(code!, body);
  return ok({ plan });
});