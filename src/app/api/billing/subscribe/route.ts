import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { provisionSubscription } from "@/lib/billing/service";

/**
 * POST /api/billing/subscribe  (tenant — BILLING_SELF)
 * Assina/troca para um plano do catálogo (definido pelo MASTER). Sem gateway:
 * apenas provisiona a assinatura (TRIAL/ATIVO conforme o plano).
 */
const subscribeSchema = z.object({ planCode: z.string().trim().min(1).max(60) }).strict();

export const POST = withApiRoute(ACTIONS.BILLING_SELF, async (ctx, req) => {
  if (!ctx.tenantId) return ok({ error: "NO_TENANT", message: "Sem tenant." });
  const body = subscribeSchema.parse(await req.json());
  const subscription = await provisionSubscription({
    tenantId: ctx.tenantId,
    planCode: body.planCode,
    provider: "CUSTOM",
    force: true,
  });
  return ok({ subscription });
});