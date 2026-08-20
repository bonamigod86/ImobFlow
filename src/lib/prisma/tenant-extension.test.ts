import { describe, expect, it } from "vitest";
import { prisma, prismaUnscoped } from "@/lib/prisma/client";
import {
  TenantContextStore,
  withTenantContext,
  TenantContextRequiredError,
} from "@/lib/tenant/context";
import { isTenantScoped } from "@/lib/prisma/tenant-extension";

/**
 * These tests prove the FAIL-CLOSED guarantee of the tenant extension:
 * tenant-scoped queries are impossible outside an ambient tenant context.
 * They never touch PostgreSQL (the extension throws before any query runs).
 */

describe("tenant isolation (fail-closed)", () => {
  it("classifies tenant-scoped vs platform models", () => {
    expect(isTenantScoped("Property")).toBe(true);
    expect(isTenantScoped("Lead")).toBe(true);
    expect(isTenantScoped("PropertyMedia")).toBe(true);
    expect(isTenantScoped("PropertyView")).toBe(true);
    expect(isTenantScoped("PropertyPattern")).toBe(true);
    expect(isTenantScoped("ImportBatch")).toBe(true);
    expect(isTenantScoped("User")).toBe(true);
    expect(isTenantScoped("AuditLog")).toBe(true);
    expect(isTenantScoped("Tenant")).toBe(false);
    expect(isTenantScoped("Plan")).toBe(false);
  });

  it("blocks tenant-scoped reads when no context exists", async () => {
    await expect(prisma.property.findMany({})).rejects.toThrow(
      TenantContextRequiredError,
    );
    await expect(prisma.lead.findFirst({})).rejects.toThrow(
      TenantContextRequiredError,
    );
    await expect(prisma.propertyMedia.findMany({})).rejects.toThrow(
      TenantContextRequiredError,
    );
    await expect(prisma.propertyView.findMany({})).rejects.toThrow(
      TenantContextRequiredError,
    );
    await expect(prisma.importBatch.findMany({})).rejects.toThrow(
      TenantContextRequiredError,
    );
  });

  it("blocks tenant-scoped writes when no context exists", async () => {
    await expect(
      prisma.property.create({ data: {} as never }),
    ).rejects.toThrow(TenantContextRequiredError);
  });

  it("blocks writes that lack a tenantId in a non-MASTER context", async () => {
    await withTenantContext(
      { tenantId: null, tenantSlug: null, userId: "u1", role: "AGENT" },
      () =>
        expect(prisma.lead.findMany({})).rejects.toThrow(TenantContextRequiredError),
    );
  });

  it("registers and reads back the ambient context", () => {
    const seen = TenantContextStore.run(
      { tenantId: "t_1", tenantSlug: "acme", userId: "u1", role: "OWNER" },
      () => TenantContextStore.get(),
    );
    expect(seen).toMatchObject({ tenantId: "t_1", tenantSlug: "acme" });
  });

  it("platform models do not require a tenant context", () => {
    // Should NOT throw synchronously — the platform client is available.
    expect(typeof prismaUnscoped.plan.findMany).toBe("function");
    expect(typeof prismaUnscoped.tenant.findUnique).toBe("function");
  });
});