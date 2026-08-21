import crypto from "node:crypto";
import type { User, UserRole } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { runDbTx } from "@/lib/prisma/tx";
import { AppError } from "@/lib/http/errors";
import { hashPassword } from "@/lib/auth/password";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { eventBus } from "@/lib/events/event-bus";
import "../events/register";

/**
 * Tenant team / permissions management (Checklist Item 19).
 *
 * Roles (RBAC): OWNER, MANAGER, AGENT, RECEPTIONIST. MASTER is a platform-only
 * role and can never be assigned to a tenant member. Every operation is
 * tenant-scoped (explicit `tenantId`) and guarded at the route layer by the
 * USERS_* actions; data never crosses tenants.
 */

export const ASSIGNABLE_ROLES: readonly UserRole[] = [
  "OWNER",
  "MANAGER",
  "AGENT",
  "RECEPTIONIST",
];

export interface TeamUserView {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

function toView(u: User): TeamUserView {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}

async function ownerCount(tenantId: string): Promise<number> {
  return prismaUnscoped.user.count({ where: { tenantId, role: "OWNER", isActive: true } });
}

export async function listTeamUsers(tenantId: string): Promise<TeamUserView[]> {
  const users = await prismaUnscoped.user.findMany({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  return users.map(toView);
}

export async function createTeamUser(input: {
  tenantId: string;
  actorUserId: string;
  name: string;
  email: string;
  role: UserRole;
}): Promise<TeamUserView> {
  const role = input.role;
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new AppError(400, "INVALID_ROLE", "Função não atribuível a um membro do tenant.");
  }
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, "INVALID_EMAIL", "E-mail inválido.");
  }
  if (await prismaUnscoped.user.findUnique({ where: { email } })) {
    throw new AppError(409, "EMAIL_TAKEN", "Já existe um usuário com este e-mail.");
  }

  // One-time temporary password — the member logs in with it and is encouraged
  // to reset via the forgot-password flow (never stored or returned in clear).
  const tempPassword = crypto.randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(tempPassword);

  const created = await runDbTx(async (tx) =>
    tx.user.create({
      data: {
        tenantId: input.tenantId,
        name: input.name.trim(),
        email,
        passwordHash,
        role,
      },
    }),
  );

  const tenant = await prismaUnscoped.tenant.findUnique({
    where: { id: input.tenantId },
    select: { name: true, slug: true },
  });

  await AuditService.log({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: AUDIT_ACTIONS.USER_CREATED,
    entity: "User",
    entityId: created.id,
    details: { email, role, tenantName: tenant?.name ?? null },
  });
  eventBus.emit("user.created", {
    userId: created.id,
    tenantId: input.tenantId,
    tenantName: tenant?.name ?? null,
  });

  return toView(created);
}

export async function updateTeamUser(input: {
  tenantId: string;
  actorUserId: string;
  userId: string;
  role?: UserRole;
  isActive?: boolean;
}): Promise<TeamUserView> {
  const target = await prismaUnscoped.user.findFirst({
    where: { id: input.userId, tenantId: input.tenantId },
  });
  if (!target) throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");

  if (input.role && !ASSIGNABLE_ROLES.includes(input.role)) {
    throw new AppError(400, "INVALID_ROLE", "Função não atribuível a um membro do tenant.");
  }

  // Guard the ownership: never strip/disable the last active OWNER.
  if ((input.role && input.role !== "OWNER" && target.role === "OWNER") ||
      (input.isActive === false && target.role === "OWNER")) {
    const owners = await ownerCount(input.tenantId);
    if (owners <= 1) {
      throw new AppError(409, "LAST_OWNER", "Não é possível remover o último proprietário ativo.");
    }
  }

  const updated = await prismaUnscoped.user.update({
    where: { id: target.id },
    data: {
      ...(input.role ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await AuditService.log({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: AUDIT_ACTIONS.USER_UPDATED,
    entity: "User",
    entityId: updated.id,
    details: {
      email: updated.email,
      role: input.role ?? undefined,
      isActive: input.isActive,
    },
  });

  return toView(updated);
}

export async function deleteTeamUser(input: {
  tenantId: string;
  actorUserId: string;
  userId: string;
}): Promise<void> {
  if (input.userId === input.actorUserId) {
    throw new AppError(400, "SELF_DELETE", "Você não pode excluir a própria conta.");
  }
  const target = await prismaUnscoped.user.findFirst({
    where: { id: input.userId, tenantId: input.tenantId },
  });
  if (!target) throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado.");

  if (target.role === "OWNER") {
    const owners = await ownerCount(input.tenantId);
    if (owners <= 1) {
      throw new AppError(409, "LAST_OWNER", "Não é possível excluir o último proprietário ativo.");
    }
  }

  await prismaUnscoped.user.delete({ where: { id: target.id } });

  await AuditService.log({
    tenantId: input.tenantId,
    userId: input.actorUserId,
    action: AUDIT_ACTIONS.USER_DELETED,
    entity: "User",
    entityId: target.id,
    details: { email: target.email, role: target.role },
  });
}
