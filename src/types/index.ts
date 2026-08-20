import type { UserRole } from "@prisma/client";
import type { SessionToken } from "@/lib/auth/jwt";

/**
 * Domain-wide shared types.
 *
 * Prisma already generates the row types for Tenant/User/Property/Lead etc.
 * (`@prisma/client`). This file only hosts cross-cutting types that are not
 * tied to a single module: the session identity and dashboard-facing DTOs.
 */

export type { SessionToken };

/** Principal authenticated in a request (subset carried by the session JWT). */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string | null;
  tenantSlug: string | null;
}

/** Serialize only safe, non-secret fields of a user for API responses. */
export function toPublicUser(
  user: Pick<
    AuthenticatedUser,
    "id" | "email" | "name" | "role" | "tenantId"
  > & { tenantSlug?: string | null },
) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    tenantSlug: user.tenantSlug ?? null,
  };
}