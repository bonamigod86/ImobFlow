import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { runRetentionSweep } from "@/lib/privacy/gdpr";
import { env } from "@/lib/config/env";

/**
 * POST /api/admin/privacy/sweep  (MASTER-only)
 * Triggers the LGPD retention policy sweep: anonymizes opted-out leads whose
 * withdrawal is older than `GDPR_RETENTION_DAYS`. Runnable on demand; a daily
 * cron (or the billing worker) can also call `runRetentionSweep`.
 */

export const POST = withApiRoute(ACTIONS.BILLING_ADMIN, async () => {
  const anonymized = await runRetentionSweep(env.GDPR_RETENTION_DAYS);
  return ok({ anonymized });
});