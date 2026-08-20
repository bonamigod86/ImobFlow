import { PrismaClient } from "@prisma/client";
import { env } from "@/lib/config/env";
import { tenantScopeExtension } from "@/lib/prisma/tenant-extension";

const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

/**
 * The BASE client — NOT tenant-scoped. Only these callers may use it:
 *   - the tenant resolver / platform infra (Tenant, Plan models)
 *   - the AuditService (which stamps tenantId explicitly)
 *   - login (pre-context user lookup) and seed/worker bootstrap
 * Everything else MUST use `prisma` (the extended client below).
 */
const baseClient =
  globalForPrisma.prismaBase ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.prismaBase = baseClient;
}

/** Tenant-isolated client — injects/enforces `tenantId` on every call. */
export const prisma = baseClient.$extends(tenantScopeExtension);

/** Raw, unscoped client for sanctioned infrastructure paths (see above). */
export const prismaUnscoped = baseClient;

export type TenantScopedClient = typeof prisma;
export type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];