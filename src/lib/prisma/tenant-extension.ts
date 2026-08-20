import { Prisma } from "@prisma/client";
import {
  TenantContextRequiredError,
  TenantContextStore,
  type AmbientContext,
} from "@/lib/tenant/context";

/**
 * End-to-end tenant isolation at the ORM layer.
 *
 * Strategy
 * --------
 * 1. Reads/writes on tenant-scoped models (`Property`, `Lead`, `User`,
 *    `AuditLog`) automatically receive a `tenantId` filter/value resolved from
 *    the ambient `TenantContext` (AsyncLocalStorage) registered by
 *    `withApiRoute` / `withTenantContext`.
 *
 * 2. FAIL-CLOSED: if no context exists (or the model demands a tenant but the
 *    context has none) the operation throws `TenantContextRequiredError`
 *    before hitting PostgreSQL. Cross-tenant leaks are impossible by
 *    construction rather than by discipline.
 *
 * 3. `Tenant` / `Plan` are platform-level and never get a tenant filter.
 *
 * 4. A single explicit escape hatch â€” `runWithoutTenantScope` â€” exists for
 *    trusted infrastructure (seeders, platform console, migration tooling)
 *    only, and is enforced by convention + code review.
 *
 * Note on `findUnique`/`update`/`delete`: those API accept only *unique*
 * where-args, so the extension resolves the row FIRST via `findFirst` (with the
 * tenant filter) and then re-runs the operation keyed on `id`. This preserves
 * Prisma semantics while guaranteeing the row belonged to the active tenant.
 */

const UNMANAGED_MODELS = new Set<string>(["Tenant", "Plan", "BillingEvent"]);
/** Strictly tenant-scoped â€” a tenantId is ALWAYS required. */
/** Strictly tenant-scoped — a tenantId is ALWAYS required. */
const STRICT_MODELS = new Set<string>([
  "Property",
  "PropertyMedia",
  "PropertyView",
  "PropertyPattern",
  "ImportBatch",
  "Lead",
  "LeadConsent",
  "FinancialLeadProfile",
  "WebhookDelivery",
  "WebhookDeliveryAttempt",
  "TenantSubscription",
  "PaymentInvoice",
  "BillingNotification",
  "HighlightPurchase",
  "PropertyHighlight",
  "HighlightCreditLedger",
]);
/** Softly tenant-scoped â€” permits NULL tenant for MASTER platform context. */
const SOFT_MODELS = new Set<string>(["User", "AuditLog"]);

export function isTenantScoped(model: string): boolean {
  return STRICT_MODELS.has(model) || SOFT_MODELS.has(model);
}

/**
 * Resolve the tenantId that should be injected for `model`, or `null` when the
 * model is platform-level / the caller runs with an explicit bypass.
 */
function resolveTenantFor(model: string): string | null {
  // Platform-level models never need a tenant context.
  if (UNMANAGED_MODELS.has(model)) return null;

  const ctx = requireContext(model);
  if ("bypassTenantScope" in ctx) return null; // explicit infra escape hatch

  if (STRICT_MODELS.has(model)) {
    if (!ctx.tenantId) {
      throw new TenantContextRequiredError(
        `${model} always requires a tenantId in the ambient context.`,
      );
    }
    return ctx.tenantId;
  }

  // SOFT_MODELS
  if (ctx.tenantId) return ctx.tenantId;
  if (ctx.role === "MASTER") return null; // platform admin sees all
  throw new TenantContextRequiredError(
    `${model} requires a tenantId unless the caller is a MASTER platform admin.`,
  );
}

function requireContext(model: string): AmbientContext {
  const ctx = TenantContextStore.get();
  if (!ctx) {
    throw new TenantContextRequiredError(
      `No tenant context registered for model. Wrap the request with withApiRoute() or run withTenantContext().`,
    );
  }
  return ctx;
}

/**
 * Merge `tenantId` into a Prisma where object using `AND` so the caller's own
 * filters are never clobbered (a caller-supplied tenantId would conflict â€”
 * which safely yields zero rows rather than leaking data).
 * Typed `any` intentionally: Prisma where inputs are per-model structural types.
 */
export function withTenantFilter(where: unknown, tenantId: string): any {
  if (!where) return { tenantId };
  return { AND: [where, { tenantId }] };
}

export function assertIdWhere(name: string, where: Record<string, unknown> | undefined): void {
  if (!where || typeof where.id !== "string") {
    throw new TenantContextRequiredError(
      `${name} on a tenant-scoped model requires a unique 'id' in where. ` +
        `For non-id updates use updateMany/deleteMany (tenantId is injected automatically).`,
    );
  }
}

/** Minimal model-delegate surface used by the extension (dynamic, untyped). */
interface FindDelegate {
  findFirst: (a: any) => Promise<any>;
}
interface CrudDelegate extends FindDelegate {
  update: (a: any) => Promise<any>;
  create: (a: any) => Promise<any>;
}

/** Access a model's delegate off the raw client (by string model name). */
function delegate<D>(client: object, model: string): D {
  return (client as unknown as Record<string, D>)[model] as D;
}

/** Prisma client extension definition (see header comment). */
export const tenantScopeExtension = Prisma.defineExtension((client) =>
  client.$extends({
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (tenantId) {
            args = {
              ...args,
              data: { ...(args.data as any), tenantId },
            };
          }
          return query(args);
        },

async createMany({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (tenantId && Array.isArray(args.data)) {
            args = {
              ...args,
              // Re-map each row to inject tenantId; cast reassembles the per-model
              // union the spread otherwise loses.
              data: args.data.map((row) => ({
                ...(row as Record<string, unknown>),
                tenantId,
              })) as typeof args.data,
            } as any;
          }
          return query(args);
        },

        async findUnique({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);
          // Unique-where does not allow extra non-unique fields, so translate to
          // findFirst scoped by tenantId (row returned only if it belongs here).
          const anyClient = delegate<FindDelegate>(client, model);
          return anyClient.findFirst({
            ...args,
            where: { ...(args.where as any), tenantId },
          });
        },

        async findFirst({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);
          args = { ...args, where: withTenantFilter(args.where, tenantId) };
          return query(args);
        },

        async findMany({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);
          args = { ...args, where: withTenantFilter(args.where, tenantId) };
          return query(args);
        },

        async count({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);
          args = { ...args, where: withTenantFilter(args.where, tenantId) };
          return query(args);
        },

        async aggregate({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);
          args = { ...args, where: withTenantFilter(args.where, tenantId) };
          return query(args);
        },

        async groupBy({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);
          args = { ...args, where: withTenantFilter(args.where, tenantId) };
          return query(args);
        },

        async update({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);

          assertIdWhere("update", args.where);
          const existing = await delegate<FindDelegate>(client, model).findFirst({
            where: { id: (args.where as { id: string }).id, tenantId },
          });
          if (!existing) {
            throw tenantTargetNotFound(model);
          }
          return query({ ...args, where: { id: (args.where as { id: string }).id } });
        },

        async updateMany({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);
          args = { ...args, where: withTenantFilter(args.where, tenantId) };
          return query(args);
        },

        async delete({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);

          assertIdWhere("delete", args.where);
          const existing = await delegate<FindDelegate>(client, model).findFirst({
            where: { id: (args.where as { id: string }).id, tenantId },
          });
          if (!existing) {
            throw tenantTargetNotFound(model);
          }
          return query({ ...args, where: { id: (args.where as { id: string }).id } });
        },

        async deleteMany({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);
          args = { ...args, where: withTenantFilter(args.where, tenantId) };
          return query(args);
        },

        async upsert({ model, args, query }) {
          const tenantId = resolveTenantFor(model);
          if (!tenantId) return query(args);
          assertIdWhere("upsert", args.where);

          const existing = await delegate<FindDelegate>(client, model).findFirst({
            where: { id: (args.where as { id: string }).id, tenantId },
          });

          if (existing) {
            const crud = delegate<CrudDelegate>(client, model);
            return crud.update({
              where: { id: (args.where as { id: string }).id },
              data: (args as { update: unknown }).update,
            });
          }
          const crud = delegate<CrudDelegate>(client, model);
          return crud.create({
            data: {
              ...(args as { create: Record<string, unknown> }).create,
              tenantId,
            },
          });
        },
      },
    },
  }),
);

function tenantTargetNotFound(model: string): Error {
  const prisma = Prisma as unknown as {
    PrismaClientKnownRequestError: new (
      message: string,
      opts: { code: string; clientVersion: string },
    ) => Error;
    prismaVersion: { client: string };
  };
  return new prisma.PrismaClientKnownRequestError(
    `No ${model} found for the active tenant.`,
    { code: "P2025", clientVersion: prisma.prismaVersion.client },
  );
}
