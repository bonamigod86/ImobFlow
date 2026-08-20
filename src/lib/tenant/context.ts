import { AsyncLocalStorage } from "node:async_hooks";
import type { UserRole } from "@prisma/client";

/**
 * Tenant runtime context.
 *
 * Carried through the whole request (or worker job) via `AsyncLocalStorage`
 * so that ANY code called below can resolve "who is the active tenant" without
 * thread-local/global mutable state — even across async boundaries.
 */
export interface TenantContext {
  /** Tenant boundary. `null` = platform-level (MASTER) context. */
  tenantId: string | null;
  tenantSlug: string | null;
  /** Authenticated principal (null in workers / system jobs). */
  userId: string | null;
  role: UserRole | null;
}

export interface BypassContext {
  /**
   * Explicit escape hatch. ONLY platform/worker infrastructure that operates
   * outside a tenant (seeders, batch jobs, platform admin) may set this.
   * The Prisma tenant-extension skips enforcement entirely when present — use
   * with extreme care; prefer `withTenantContext` per-job/per-tenant instead.
   */
  bypassTenantScope: true;
}

export type AmbientContext = TenantContext | BypassContext;

/**
 * Domain error thrown when a tenant-scoped operation is attempted without a
 * valid tenant context. The API wrapper maps this to HTTP 403/500; the failing
 * query is NEVER silently executed (fail-closed).
 */
export class TenantContextRequiredError extends Error {
  constructor(detail: string) {
    super(`Tenant context required: ${detail}`);
    this.name = "TenantContextRequiredError";
  }
}

const storage = new AsyncLocalStorage<AmbientContext>();

/** Public read/write surface for the request-scoped tenant context. */
export const TenantContextStore = {
  run<T>(context: AmbientContext, fn: () => T): T {
    return storage.run(context, fn);
  },

  get(): AmbientContext | undefined {
    return storage.getStore();
  },
};

/**
 * Run `fn` inside an explicit tenant boundary. The Prisma tenant-extension will
 * automatically inject this `tenantId` into every tenant-scoped query.
 */
export function withTenantContext<T>(
  context: Omit<TenantContext, "bypassTenantScope">,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/**
 * Run `fn` with tenant scoping suspended. Reserved for infrastructure code that
 * must operate platform-wide (seeders, migrations, MASTER platform console).
 */
export function runWithoutTenantScope<T>(fn: () => T): T {
  const bypass: BypassContext = { bypassTenantScope: true };
  return storage.run(bypass, fn);
}

/** Strictly guarantees an ambient context exists; throws otherwise. */
export function requireAmbientContext(): AmbientContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new TenantContextRequiredError(
      "no ambient context was registered. Wrap the operation with withTenantContext().",
    );
  }
  return ctx;
}

/** Returns the active tenant id or throws when the operation is tenant-scoped. */
export function requireTenantId(): string {
  const ctx = requireAmbientContext();
  if ("bypassTenantScope" in ctx) {
    throw new TenantContextRequiredError(
      "tenant scoping is suspended in this block (bypass).",
    );
  }
  if (!ctx.tenantId) {
    throw new TenantContextRequiredError(
      "this code path requires a concrete tenantId.",
    );
  }
  return ctx.tenantId;
}