import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped metadata (IP, user-agent, timing) captured at the HTTP edge
 * and made available to services such as the AuditLogger without threading
 * parameters through every call stack.
 */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
};

/** Best-effort IP extraction honoring common reverse-proxy headers. */
export function extractIpAddress(headers: Headers): string | null {
  // Trust proxy headers only for header names Next.js relays; the middleware
  // overwrites these, and the value is used for audit trails, not authz.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  return null;
}

export function newRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}