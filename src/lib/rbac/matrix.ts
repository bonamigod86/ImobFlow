import type { UserRole } from "@prisma/client";
import { ACTIONS, type Action, ALL_ACTIONS } from "@/lib/rbac/actions";

/**
 * RBAC permission matrix.
 *
 * Roles:
 *   MASTER        — Platform admin. Full access across all tenants.
 *   OWNER         — Tenant owner. Everything inside their tenant.
 *   MANAGER       — Tenant operations lead. Users + data within the tenant.
 *   AGENT         — Sales agent. Properties + leads.
 *   RECEPTIONIST  — Front desk. Reads data and captures leads.
 *
 * The matrix is role -> Set<Action>. MASTER additionally bypasses tenant
 * boundary enforcement in the guard layer (see hasPermission / withApiRoute).
 */

/** Actions that ONLY the platform MASTER role may perform (never a tenant). */
const MASTER_ONLY_ACTIONS: ReadonlySet<Action> = new Set([
  ACTIONS.TENANT_CHANGE_STATUS,
  ACTIONS.BILLING_ADMIN,
]);

const ALL_TENANT_ACTIONS: ReadonlySet<Action> = new Set(
  ALL_ACTIONS.filter((a) => !MASTER_ONLY_ACTIONS.has(a)),
);

export const PERMISSION_MATRIX: Record<UserRole, ReadonlySet<Action>> = {
  MASTER: new Set(ALL_ACTIONS),
  OWNER: ALL_TENANT_ACTIONS,
  MANAGER: new Set([
    ACTIONS.DASHBOARD_READ,
    ACTIONS.TENANT_READ,
    ACTIONS.TENANT_UPDATE,
    ACTIONS.USERS_READ,
    ACTIONS.USERS_CREATE,
    ACTIONS.USERS_UPDATE,
    ACTIONS.PROPERTIES_READ,
    ACTIONS.PROPERTIES_CREATE,
    ACTIONS.PROPERTIES_UPDATE,
    ACTIONS.PROPERTIES_DELETE,
    ACTIONS.PROPERTIES_EXPORT,
    ACTIONS.LEADS_READ,
    ACTIONS.LEADS_CREATE,
    ACTIONS.LEADS_UPDATE,
    ACTIONS.LEADS_DELETE,
    ACTIONS.LEADS_ASSIGN,
    ACTIONS.LEADS_EXPORT,
    ACTIONS.LEADS_ROUTE,
    ACTIONS.AUDIT_READ,
    ACTIONS.INTEGRATIONS_MANAGE,
    ACTIONS.SETTINGS_MANAGE,
    ACTIONS.BILLING_SELF,
  ]),
  AGENT: new Set([
    ACTIONS.DASHBOARD_READ,
    ACTIONS.TENANT_READ,
    ACTIONS.PROPERTIES_READ,
    ACTIONS.PROPERTIES_UPDATE,
    ACTIONS.LEADS_READ,
    ACTIONS.LEADS_CREATE,
    ACTIONS.LEADS_UPDATE,
    ACTIONS.LEADS_ASSIGN,
    ACTIONS.LEADS_ROUTE,
  ]),
  RECEPTIONIST: new Set([
    ACTIONS.DASHBOARD_READ,
    ACTIONS.TENANT_READ,
    ACTIONS.PROPERTIES_READ,
    ACTIONS.LEADS_READ,
    ACTIONS.LEADS_CREATE,
    ACTIONS.LEADS_UPDATE,
  ]),
};

/** Return the set of actions granted to `role` (for UI feature flags, menus…). */
export function getActionsForRole(role: UserRole): ReadonlySet<Action> {
  return PERMISSION_MATRIX[role];
}

/** Public, serializable record of role -> sorted actions (for the UI bootstrap). */
export function rolePermissionSnapshot(): Record<UserRole, Action[]> {
  return Object.fromEntries(
    (Object.keys(PERMISSION_MATRIX) as UserRole[]).map((role) => [
      role,
      [...PERMISSION_MATRIX[role]].sort(),
    ]),
  ) as Record<UserRole, Action[]>;
}