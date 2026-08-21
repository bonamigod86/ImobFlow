import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { prismaUnscoped } from "@/lib/prisma/client";
import { EMAIL_EVENT_LABELS } from "@/lib/email/templates";
import type { EmailEvent } from "@/lib/email/types";

/**
 * PUT /api/admin/email-templates/[event]  (MASTER-only)
 * Upserts an `EmailTemplate` override. Empty strings clear the field (falling
 * back to the code default template); `enabled: false` fully restores defaults.
 * Fields use `{{variável}}` placeholders resolved from the event payload.
 */

const patchSchema = z
  .object({
    subject: z.string().max(200).optional(),
    htmlBody: z.string().max(20000).optional(),
    textBody: z.string().max(20000).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const emailEvents = Object.keys(EMAIL_EVENT_LABELS) as EmailEvent[];

export const PUT = withApiRoute(ACTIONS.BILLING_ADMIN, async (_ctx, req, params) => {
  const event = Array.isArray(params.event) ? params.event[0] : params.event;
  if (!event || !emailEvents.includes(event as EmailEvent)) {
    return ok({ error: "UNKNOWN_EVENT", message: `Evento "${event}" não existe.` });
  }

  const body = patchSchema.parse(await req.json());
  const record = await prismaUnscoped.emailTemplate.upsert({
    where: { event },
    update: {
      ...(body.subject !== undefined ? { subject: body.subject || null } : {}),
      ...(body.htmlBody !== undefined ? { htmlBody: body.htmlBody || null } : {}),
      ...(body.textBody !== undefined ? { textBody: body.textBody || null } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    },
    create: {
      event,
      subject: body.subject ?? null,
      htmlBody: body.htmlBody ?? null,
      textBody: body.textBody ?? null,
      enabled: body.enabled ?? true,
    },
  });

  return ok({ template: record });
});