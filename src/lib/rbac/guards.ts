import type { UserRole } from "@prisma/client";
import { hasPermission, type Principal } from "@/lib/rbac/has-permission";
import type { Action } from "@/lib/rbac/actions";

/** Thrown when the authenticated principal is not granted `action`. */
export class ForbiddenError extends Error {
  constructor(public readonly action: Action) {
    super(`Forbidden: principal lacks permission '${action}'`);
    this.name = "ForbiddenError";
  }
}

/** Throw-based guard for server-side code (server actions, services). */
export function assertPermission(principal: Principal, action: Action): void {
  if (!hasPermission(principal, action)) {
    throw new ForbiddenError(action);
  }
}

/**
 * Higher-order guard for API handlers: returns a function that fails fast
 * before the handler runs when the principal lacks `action`.
 */
export function requirePermission<H>(action: Action, handler: H): H {
  return ((...args: unknown[]) => {
    // The principal must be extracted from the ambient tenant context that
    // route-wrapper established BEFORE any handler runs.
    const { requireAmbientContext } = require("@/lib/tenant/context");
    const ambient = requireAmbientContext();

    if ("bypassTenantScope" in ambient) {
      // Should never happen for user traffic — indicates an infra bug.
      throw new ForbiddenError(action);
    }

    if (!hasPermission({ role: ambient.role ?? "MASTER", tenantId: ambient.tenantId }, action)) {
      throw new ForbiddenError(action);
    }

    return (handler as (...a: unknown[]) => unknown)(...args);
  }) as unknown as H;
}

/** Validate a role value coming from user input. */
export function isRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    ["MASTER", "OWNER", "MANAGER", "AGENT", "RECEPTIONIST"].includes(value)
  );
}