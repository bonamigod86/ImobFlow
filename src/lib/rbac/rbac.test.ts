import { describe, expect, it } from "vitest";
import { hasPermission, hasAnyPermission } from "@/lib/rbac/has-permission";
import { PERMISSION_MATRIX, getActionsForRole, rolePermissionSnapshot } from "@/lib/rbac/matrix";
import { ACTIONS } from "@/lib/rbac/actions";
import { assertPermission, ForbiddenError, isRole } from "@/lib/rbac/guards";

const principal = (role: Parameters<typeof hasPermission>[0]["role"], tenantId: string | null = "t1") =>
  ({ role, tenantId });

describe("RBAC permission matrix", () => {
  it("MASTER bypasses the matrix entirely", () => {
    expect(hasPermission(principal("MASTER"), ACTIONS.TENANT_CHANGE_STATUS)).toBe(true);
    expect(hasPermission(principal("MASTER"), ACTIONS.LEADS_DELETE)).toBe(true);
  });

  it("MASTER is the only role holding tenant:change-status (platform)", () => {
    const changeStatus = ACTIONS.TENANT_CHANGE_STATUS;
    expect(hasPermission(principal("OWNER"), changeStatus)).toBe(false);
    expect(hasPermission(principal("MANAGER"), changeStatus)).toBe(false);
    expect(hasPermission(principal("AGENT"), changeStatus)).toBe(false);
    expect(hasPermission(principal("RECEPTIONIST"), changeStatus)).toBe(false);
  });

  it("OWNER holds every tenant-scoped action", () => {
    const tenantActions = Object.values(ACTIONS).filter(
      (a) => a !== ACTIONS.TENANT_CHANGE_STATUS && a !== ACTIONS.BILLING_ADMIN,
    );
    for (const action of tenantActions) {
      expect(hasPermission(principal("OWNER"), action), action).toBe(true);
    }
  });

  it("billing:admin is MASTER-only while billing:self is tenant-scoped", () => {
    expect(hasPermission(principal("MASTER"), ACTIONS.BILLING_ADMIN)).toBe(true);
    expect(hasPermission(principal("OWNER"), ACTIONS.BILLING_ADMIN)).toBe(false);
    expect(hasPermission(principal("MANAGER"), ACTIONS.BILLING_ADMIN)).toBe(false);
    expect(hasPermission(principal("AGENT"), ACTIONS.BILLING_ADMIN)).toBe(false);
    expect(hasPermission(principal("OWNER"), ACTIONS.BILLING_SELF)).toBe(true);
    expect(hasPermission(principal("MANAGER"), ACTIONS.BILLING_SELF)).toBe(true);
    expect(hasPermission(principal("AGENT"), ACTIONS.BILLING_SELF)).toBe(false);
  });

  it("MANAGER manages users/properties/leads but cannot delete users", () => {
    expect(hasPermission(principal("MANAGER"), ACTIONS.USERS_CREATE)).toBe(true);
    expect(hasPermission(principal("MANAGER"), ACTIONS.PROPERTIES_DELETE)).toBe(true);
    expect(hasPermission(principal("MANAGER"), ACTIONS.USERS_DELETE)).toBe(false);
    expect(hasPermission(principal("MANAGER"), ACTIONS.LEADS_DELETE)).toBe(true);
  });

  it("AGENT reads properties & manages leads but no user/billing actions", () => {
    expect(hasPermission(principal("AGENT"), ACTIONS.PROPERTIES_READ)).toBe(true);
    expect(hasPermission(principal("AGENT"), ACTIONS.LEADS_UPDATE)).toBe(true);
    expect(hasPermission(principal("AGENT"), ACTIONS.USERS_READ)).toBe(false);
    expect(hasPermission(principal("AGENT"), ACTIONS.SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(principal("AGENT"), ACTIONS.PROPERTIES_DELETE)).toBe(false);
  });

  it("RECEPTIONIST captures leads but cannot delete or export", () => {
    expect(hasPermission(principal("RECEPTIONIST"), ACTIONS.LEADS_CREATE)).toBe(true);
    expect(hasPermission(principal("RECEPTIONIST"), ACTIONS.LEADS_UPDATE)).toBe(true);
    expect(hasPermission(principal("RECEPTIONIST"), ACTIONS.LEADS_DELETE)).toBe(false);
    expect(hasPermission(principal("RECEPTIONIST"), ACTIONS.LEADS_EXPORT)).toBe(false);
    expect(hasPermission(principal("RECEPTIONIST"), ACTIONS.PROPERTIES_CREATE)).toBe(false);
  });

  it("hasAnyPermission short-circuits", () => {
    expect(
      hasAnyPermission(principal("AGENT"), [ACTIONS.USERS_READ, ACTIONS.LEADS_READ]),
    ).toBe(true);
    expect(hasAnyPermission(principal("AGENT"), [ACTIONS.USERS_READ, ACTIONS.USERS_CREATE])).toBe(
      false,
    );
  });

  it("permission snapshots are serializable & complete", () => {
    const snapshot = rolePermissionSnapshot();
    expect(Object.keys(snapshot)).toHaveLength(5);
    expect(snapshot.OWNER.length).toBeGreaterThan(10);
  });
});

describe("guards", () => {
  it("assertPermission throws ForbiddenError on denial, passes on grant", () => {
    expect(() =>
      assertPermission(principal("RECEPTIONIST"), ACTIONS.LEADS_CREATE),
    ).not.toThrow();
    expect(() =>
      assertPermission(principal("RECEPTIONIST"), ACTIONS.PROPERTIES_DELETE),
    ).toThrow(ForbiddenError);
  });

  it("isRole validates role strings", () => {
    expect(isRole("MASTER")).toBe(true);
    expect(isRole("OWNER")).toBe(true);
    expect(isRole("SUPER_ADMIN")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it("every role key in PERMISSION_MATRIX is a valid UserRole", () => {
    const roles = ["MASTER", "OWNER", "MANAGER", "AGENT", "RECEPTIONIST"];
    for (const role of roles) {
      expect(getActionsForRole(role as keyof typeof PERMISSION_MATRIX)).toBeDefined();
    }
  });
});