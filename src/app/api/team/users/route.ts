import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok } from "@/lib/http/errors";
import { listTeamUsers, createTeamUser } from "@/lib/users/team-service";

/**
 * /api/team/users — tenant team & permissions (Checklist Item 19).
 * GET  -> list members (USERS_READ)
 * POST -> create a member with a role (USERS_CREATE)
 *
 * Roles follow the RBAC matrix (OWNER/MANAGER/AGENT/RECEPTIONIST); MASTER is
 * never assignable. Tenant isolation is enforced by the ambient context + an
 * explicit `tenantId` in the service.
 */

const createSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    email: z.string().trim().email().toLowerCase(),
    role: z.enum(["OWNER", "MANAGER", "AGENT", "RECEPTIONIST"]),
  })
  .strict();

export const GET = withApiRoute(ACTIONS.USERS_READ, async (ctx) => {
  if (!ctx.tenantId) return ok({ users: [] });
  const users = await listTeamUsers(ctx.tenantId);
  return ok({ users });
});

export const POST = withApiRoute(ACTIONS.USERS_CREATE, async (ctx, req) => {
  if (!ctx.tenantId) {
    return ok({ error: "NO_TENANT", message: "Usuários são gerenciados dentro de um tenant." });
  }
  const body = createSchema.parse(await req.json());
  const user = await createTeamUser({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    name: body.name,
    email: body.email,
    role: body.role,
  });
  return ok({ user });
});