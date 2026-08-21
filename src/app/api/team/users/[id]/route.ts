import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { updateTeamUser, deleteTeamUser } from "@/lib/users/team-service";

/**
 * /api/team/users/[id] — single member operations (Checklist Item 19).
 * PATCH  -> change role / activate / deactivate (USERS_UPDATE)
 * DELETE -> remove a member (USERS_DELETE — OWNER only)
 */

const patchSchema = z
  .object({
    role: z.enum(["OWNER", "MANAGER", "AGENT", "RECEPTIONIST"]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export const PATCH = withApiRoute(ACTIONS.USERS_UPDATE, async (ctx, req, params) => {
  if (!ctx.tenantId) return ok({ error: "NO_TENANT", message: "Sem tenant." });
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;
  const body = patchSchema.parse(await req.json());
  const user = await updateTeamUser({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    userId: userId!,
    role: body.role,
    isActive: body.isActive,
  });
  return ok({ user });
});

export const DELETE = withApiRoute(ACTIONS.USERS_DELETE, async (ctx, _req, params) => {
  if (!ctx.tenantId) return ok({ error: "NO_TENANT", message: "Sem tenant." });
  const userId = Array.isArray(params.id) ? params.id[0] : params.id;
  await deleteTeamUser({ tenantId: ctx.tenantId, actorUserId: ctx.userId, userId: userId! });
  return ok({ deleted: true });
});