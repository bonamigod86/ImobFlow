import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { getLeadPrivacy } from "@/lib/privacy/gdpr";

/**
 * GET /api/leads/[id]/privacy  (tenant — LEADS_READ)
 * LGPD data-subject view for one lead: consent record (versão/finalidade/data/
 * hora/origem/IP), status de retição e rastreabilidade dos envios externos.
 */

export const GET = withApiRoute(ACTIONS.LEADS_READ, async (ctx, _req, params) => {
  if (!ctx.tenantId) return ok({ error: "NO_TENANT", message: "Sem tenant." });
  const leadId = Array.isArray(params.id) ? params.id[0] : params.id;
  const privacy = await getLeadPrivacy(ctx.tenantId, leadId!);
  return ok({ privacy });
});