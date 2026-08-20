import type { UserRole } from "@prisma/client";
import { PERMISSION_MATRIX } from "@/lib/rbac/matrix";
import type { Action } from "@/lib/rbac/actions";

/** Minimal identity a guard needs. */
export interface Principal {
  role: UserRole;
  tenantId: string | null;
}

/**
 * Core authorization predicate: may `principal` perform `action`?
 *
 * MASTER is granted everything; every other role is validated against the
 * role->actions matrix. Tenant-boundary enforcement is layered on top of this
 * (a user can only ever act inside tenants they belong to — see route-wrapper).
 */
export function hasPermission(principal: Principal, action: Action): boolean {
  if (principal.role === "MASTER") return true;
  const granted = PERMISSION_MATRIX[principal.role];
  return granted?.has(action) ?? false;
}

/** Predicate for several actions (returns true when ANY is granted). */
export function hasAnyPermission(principal: Principal, actions: Action[]): boolean {
  return actions.some((a) => hasPermission(principal, a));
}