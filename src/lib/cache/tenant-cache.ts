import type { Tenant, TenantStatus } from "@prisma/client";
import { cacheGet, cacheSet, cacheDelete } from "@/lib/cache/cache";

/**
 * Hot-path tenant cache. Tenant lookups happen on EVERY authenticated request
 * (subdomain/status resolution); Redis keyed cache cuts the DB round-trip while
 * mutation points (`TenantAdminService`) invalidate both id and slug keys.
 */
export interface TenantSnapshot {
  id: string;
  slug: string;
  status: TenantStatus;
  planId: string;
  name: string;
}

const TTL_SECONDS = 60;

const keyById = (id: string) => `tenant:by-id:${id}`;
const keyBySlug = (slug: string) => `tenant:by-slug:${slug}`;

export function toSnapshot(tenant: Tenant): TenantSnapshot {
  return {
    id: tenant.id,
    slug: tenant.slug,
    status: tenant.status,
    planId: tenant.planId,
    name: tenant.name,
  };
}

export const TenantCache = {
  async getById(id: string): Promise<TenantSnapshot | null> {
    return cacheGet<TenantSnapshot>(keyById(id));
  },

  async getBySlug(slug: string): Promise<TenantSnapshot | null> {
    return cacheGet<TenantSnapshot>(keyBySlug(slug));
  },

  async set(tenant: Tenant): Promise<void> {
    const snapshot = toSnapshot(tenant);
    await Promise.all([
      cacheSet(keyById(snapshot.id), snapshot, TTL_SECONDS),
      cacheSet(keyBySlug(snapshot.slug), snapshot, TTL_SECONDS),
    ]);
  },

  async invalidate(id: string, slug: string): Promise<void> {
    await Promise.all([cacheDelete(keyById(id)), cacheDelete(keyBySlug(slug))]);
  },
};