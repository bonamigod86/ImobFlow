import type { Tenant, TenantStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import { TenantCache, type TenantSnapshot } from "@/lib/cache/tenant-cache";
import { AppError } from "@/lib/http/errors";

/**
 * Tenant resolution + status gate. Used by the HTTP route wrapper and by any
 * server code that needs the authoritative tenant for an id/slug.
 *
 * Lookups hit the Redis cache; cache misses fall through to PostgreSQL.
 */

export class TenantInactiveError extends Error {
  constructor(
    public readonly tenantId: string,
    public readonly status: TenantStatus,
  ) {
    super(`Tenant ${tenantId} is not active (status=${status}).`);
    this.name = "TenantInactiveError";
  }
}

export const ACTIVE_TENANT_STATUSES: readonly TenantStatus[] = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
];

export class TenantResolver {
  static async resolveById(id: string): Promise<Tenant | null> {
    const cached = await TenantCache.getById(id);
    if (cached) return fromSnapshot(cached);

    // Tenant is a platform-level model: allowed on the unscoped client.
    const tenant = await prismaUnscoped.tenant.findUnique({ where: { id } });
    if (!tenant) return null;

    await TenantCache.set(tenant);
    return tenant;
  }

  static async resolveBySlug(slug: string): Promise<Tenant | null> {
    const normalized = slug.toLowerCase();
    const cached = await TenantCache.getBySlug(normalized);
    if (cached) return fromSnapshot(cached);

    const tenant = await prismaUnscoped.tenant.findUnique({
      where: { slug: normalized },
    });
    if (!tenant) return null;

    await TenantCache.set(tenant);
    return tenant;
  }

  /**
   * Resolve tenant and assert it may serve traffic. Used by the API wrapper so
   * BLOCKED/CANCELLED tenants are rejected before any handler runs.
   */
  static async assertActiveById(id: string): Promise<Tenant> {
    const tenant = await this.resolveById(id);
    if (!tenant) throw new AppError(404, "TENANT_NOT_FOUND", "Tenant not found.");
    this.assertActive(tenant);
    return tenant;
  }

  static assertActive(tenant: { id: string; status: TenantStatus }): void {
    if (!ACTIVE_TENANT_STATUSES.includes(tenant.status)) {
      throw new TenantInactiveError(tenant.id, tenant.status);
    }
  }
}

function fromSnapshot(snapshot: TenantSnapshot): Tenant {
  return {
    id: snapshot.id,
    slug: snapshot.slug,
    status: snapshot.status,
    planId: snapshot.planId,
    name: snapshot.name,
    createdAt: new Date(0), // not carried in the cache snapshot
    updatedAt: new Date(0),
  } as Tenant;
}