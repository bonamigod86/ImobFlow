import { prismaUnscoped } from "@/lib/prisma/client";
import { TenantContextStore, type TenantContext } from "@/lib/tenant/context";
import { RequestContextStore } from "@/lib/http/request-context";
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/audit/actions";

/**
 * Audit Logging Service
 * ---------------------
 * Records immutable, tamper-evident operational events into `AuditLog`.
 *
 * - The tenant/user are resolved from the ambient context when not supplied
 *   explicitly (pre-login thresholds such as AUTH_LOGIN supply them manually).
 * - Writes are durabily awaited so callers can reason about ordering, but a
 *   failure NEVER fails the business operation (audit must not take down the
 *   request) — the error is logged instead.
 * - Uses the unscoped client because login events are recorded BEFORE the
 *   tenant context exists; every field is stamped explicitly here.
 */

export interface AuditLogEntry {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  details?: unknown;
  tenantId?: string | null;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export class AuditService {
  static async log(entry: AuditLogEntry): Promise<void> {
    const ambient = TenantContextStore.get();
    const request = RequestContextStore.get();

    const tenantCtx =
      ambient && "tenantId" in ambient ? (ambient as TenantContext) : undefined;

    try {
      await prismaUnscoped.auditLog.create({
        data: {
          tenantId: entry.tenantId ?? tenantCtx?.tenantId ?? null,
          userId: entry.userId ?? tenantCtx?.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          details: (entry.details as object | null) ?? undefined,
          ipAddress: entry.ipAddress ?? request?.ipAddress ?? null,
          userAgent: entry.userAgent ?? request?.userAgent ?? null,
        },
      });
    } catch (error) {
      // Audit must never break the primary request path.
      console.error("[audit] failed to persist entry", {
        action: entry.action,
        error,
      });
    }
  }

  /**
   * Non-blocking variant for fire-and-forget events (login, job failures)
   * that do not need durability guarantees on the hot path.
   */
  static logAsync(entry: AuditLogEntry): void {
    void this.log(entry);
  }
}

// Re-export for callers that keep one import surface.
export { AUDIT_ACTIONS };
export type { AuditAction } from "@/lib/audit/actions";