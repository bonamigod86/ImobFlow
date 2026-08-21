import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Team/permissions contract (Checklist Item 19): role assignment, ownership
 * guard (never strip the last OWNER), self-delete ban and email uniqueness.
 */

const mocks = vi.hoisted(() => {
  const user = {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const tenant = { findUnique: vi.fn() };
  const txUserCreate = vi.fn();
  const runDbTx = vi.fn(async (fn: (tx: unknown) => unknown) => fn({ user: { create: txUserCreate } }));
  const hashPassword = vi.fn(async () => "hashed");
  const AuditService = { log: vi.fn(async () => undefined) };
  const eventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
  return { user, tenant, txUserCreate, runDbTx, hashPassword, AuditService, eventBus };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.user as never,
  prismaUnscoped: { user: mocks.user, tenant: mocks.tenant } as never,
}));
vi.mock("@/lib/prisma/tx", () => ({ runDbTx: mocks.runDbTx }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: mocks.hashPassword }));
vi.mock("@/lib/audit/audit-service", () => ({ AuditService: mocks.AuditService }));
vi.mock("@/lib/events/event-bus", () => ({ eventBus: mocks.eventBus }));

import { createTeamUser, updateTeamUser, deleteTeamUser } from "@/lib/users/team-service";

const VIEW = {
  id: "u-2",
  tenantId: "t-acme",
  name: "Ana",
  email: "ana@acme.com",
  role: "AGENT",
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date("2026-08-20T10:00:00Z"),
  passwordHash: "x",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createTeamUser", () => {
  it("creates the member with a hashed temp password, audits and welcomes", async () => {
    mocks.user.findUnique.mockResolvedValue(null);
    mocks.txUserCreate.mockResolvedValue(VIEW);
    mocks.tenant.findUnique.mockResolvedValue({ name: "ACME", slug: "acme" });

    const created = await createTeamUser({ tenantId: "t-acme", actorUserId: "u-1", name: "Ana", email: "ana@acme.com", role: "AGENT" });

    expect(mocks.hashPassword).toHaveBeenCalled();
    expect(mocks.txUserCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: "t-acme", email: "ana@acme.com", role: "AGENT", passwordHash: "hashed" }),
    });
    expect(mocks.AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "USER_CREATED", userId: "u-1" }),
    );
    expect(mocks.eventBus.emit).toHaveBeenCalledWith("user.created", expect.objectContaining({ tenantName: "ACME" }));
    expect(created.email).toBe("ana@acme.com");
    expect(created).not.toHaveProperty("passwordHash");
  });

  it("rejects a duplicate e-mail", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: "existing" });
    await expect(
      createTeamUser({ tenantId: "t-acme", actorUserId: "u-1", name: "Ana", email: "ana@acme.com", role: "AGENT" }),
    ).rejects.toThrow(/Já existe um usuário/);
  });

  it("rejects assigning the MASTER role to a tenant member", async () => {
    await expect(
      createTeamUser({ tenantId: "t-acme", actorUserId: "u-1", name: "Ana", email: "ana@acme.com", role: "MASTER" }),
    ).rejects.toThrow(/não atribuível/);
  });
});

describe("updateTeamUser", () => {
  it("blocks stripping the last active OWNER", async () => {
    mocks.user.findFirst.mockResolvedValue({ id: "u-owner", tenantId: "t-acme", role: "OWNER" });
    mocks.user.count.mockResolvedValue(1);
    await expect(
      updateTeamUser({ tenantId: "t-acme", actorUserId: "u-1", userId: "u-owner", role: "AGENT" }),
    ).rejects.toThrow(/último proprietário/);
  });

  it("allows changing a MANAGER when another OWNER exists", async () => {
    mocks.user.findFirst.mockResolvedValue({ id: "u-owner", tenantId: "t-acme", role: "OWNER" });
    mocks.user.count.mockResolvedValue(2);
    mocks.user.update.mockResolvedValue({ ...VIEW, role: "AGENT" });
    const updated = await updateTeamUser({ tenantId: "t-acme", actorUserId: "u-1", userId: "u-owner", role: "AGENT" });
    expect(mocks.user.update).toHaveBeenCalledWith({ where: { id: "u-owner" }, data: expect.objectContaining({ role: "AGENT" }) });
    expect(updated.role).toBe("AGENT");
  });
});

describe("deleteTeamUser", () => {
  it("forbids deleting your own account", async () => {
    await expect(deleteTeamUser({ tenantId: "t-acme", actorUserId: "u-1", userId: "u-1" })).rejects.toThrow(/própria conta/);
  });
});
