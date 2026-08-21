import type { NextRequest } from "next/server";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";
import { EMAIL_EVENT_LABELS } from "@/lib/email/templates";
import type { EmailEvent } from "@/lib/email/types";

/**
 * GET /api/admin/email-templates  (MASTER-only)
 * Lists every transactional event with its current override (subject/html/text
 * and whether it's enabled). Empty fields mean the code default is in use —
 * "administração simples" of Item 15.
 */

export const GET = withApiRoute(ACTIONS.BILLING_ADMIN, async () => {
  const overrides = await prismaUnscoped.emailTemplate.findMany();
  const byEvent = new Map(overrides.map((o) => [o.event, o]));

  const templates = (Object.keys(EMAIL_EVENT_LABELS) as EmailEvent[]).map((event) => {
    const override = byEvent.get(event);
    return {
      event,
      label: EMAIL_EVENT_LABELS[event],
      customized: Boolean(override),
      enabled: override?.enabled ?? true,
      subject: override?.subject ?? null,
      htmlBody: override?.htmlBody ?? null,
      textBody: override?.textBody ?? null,
      updatedAt: override?.updatedAt.toISOString() ?? null,
    };
  });

  return ok({ templates });
});