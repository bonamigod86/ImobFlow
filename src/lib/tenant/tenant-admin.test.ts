import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Item 24 — audit da gestão manual de conta: bloquear/desbloquear um tenant
 * grava uma trilha distinta (`TENANT_MANUALLY_BLOCKED`/`UNBLOCKED`) além do
 * `tenant.status_changed`.
 */

const mocks = vi.hoisted(() => {
  const tenant = { findUnique: vi.fn(), update: vi.fn() };
  const tenantSubscription = { findUnique: vi.fn(), update: vi.fn() };
  const TenantCache = { invalidate: vi.fn(), set: vi.fn() };
  const eventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
  const AuditService = { log: vi.fn(async () => undefined) };
  return { tenant, tenantSubscription, TenantCache, eventBus, AuditService };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.tenant,
  prismaUnscoped: { tenant: mocks.tenant, tenantSubscription: mocks.tenantSubscription } as never,
}));
vi.mock("@/lib/cache/tenant-cache", () => ({ TenantCache: mocks.TenantCache }));
vi.mock("@/lib/events/event-bus", () => ({ eventBus: mocks.eventBus }));
vi.mock("@/lib/audit/audit-service", () => ({ AuditService: mocks.AuditService }));

import { TenantAdminService } from "@/lib/tenant/tenant-admin";

const BASE = {
  id: "t-delta",
  name: "Delta",
  slug: "delta",
  status: "ACTIVE",
  planId: "p1",
  manualBlockedAt: null,
  blockReason: null,
  users: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TenantAdminService.changeStatus — audit de bloqueio manual", () => {
  it("audits TENANT_MANUALLY_BLOCKED when an operator blocks", async () => {
    mocks.tenant.findUnique.mockResolvedValue({ ...BASE, status: "ACTIVE", manualBlockedAt: null });
    mocks.tenant.update.mockResolvedValue({ ...BASE, status: "BLOCKED", manualBlockedAt: new Date() });
    mocks.tenantSubscription.findUnique.mockResolvedValue(null);

    await TenantAdminService.changeStatus({ tenantId: "t-delta", newStatus: "BLOCKED", actorUserId: "u-master", reason: "fraude" });

    expect(mocks.AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TENANT_MANUALLY_BLOCKED",
        tenantId: "t-delta",
        userId: "u-master",
        details: expect.objectContaining({ from: "ACTIVE", to: "BLOCKED", reason: "fraude" }),
      }),
    );
  });

  it("audits TENANT_MANUALLY_UNBLOCKED when an operator unblocks", async () => {
    mocks.tenant.findUnique.mockResolvedValue({
      ...BASE,
      status: "BLOCKED",
      manualBlockedAt: new Date(),
      blockReason: "fraude",
    });
    mocks.tenant.update.mockResolvedValue({ ...BASE, status: "ACTIVE", manualBlockedAt: null });
    mocks.tenantSubscription.findUnique.mockResolvedValue(null);

    await TenantAdminService.changeStatus({ tenantId: "t-delta", newStatus: "ACTIVE", actorUserId: "u-master" });

    expect(mocks.AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TENANT_MANUALLY_UNBLOCKED" }),
    );
  });

  it("is a no-op (no audit) when the status does not change", async () => {
    mocks.tenant.findUnique.mockResolvedValue({ ...BASE, status: "ACTIVE", manualBlockedAt: null });

    await TenantAdminService.changeStatus({ tenantId: "t-delta", newStatus: "ACTIVE", actorUserId: "u" });

    expect(mocks.AuditService.log).not.toHaveBeenCalled();
    expect(mocks.tenant.update).not.toHaveBeenCalled();
  });
});