import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { withdrawConsent } from "@/lib/privacy/gdpr";

/**
 * POST /api/leads/[id]/privacy/withdraw  (tenant — LEADS_DELETE)
 * Right of withdrawal (LGPD): retira o consentimento e anonimiza os dados
 * pessoais do lead imediatamente (nome/e-mail/telefone/payload removidos).
 */

export const POST = withApiRoute(ACTIONS.LEADS_DELETE, async (ctx, _req, params) => {
  if (!ctx.tenantId) return ok({ error: "NO_TENANT", message: "Sem tenant." });
  const leadId = Array.isArray(params.id) ? params.id[0] : params.id;
  await withdrawConsent(ctx.tenantId, leadId!);
  return ok({ withdrawn: true });
});