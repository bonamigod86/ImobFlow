import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { QueueManager } from "@/lib/queues/queue-manager";
import type { NormalizedPropertyRow } from "@/lib/imports/parsers";
import { withTenantContext } from "@/lib/tenant/context";
import { buildSearchText, ensureUniqueSlug, slugBaseFrom } from "@/lib/properties/seo";

/**
 * ImportEngine — processes one ImportBatch.
 *
 * Contract (mirrors the Ports/Adapters style of the rest of Phase 2):
 *   - `runBatch` loads the batch, iterates the normalized rows produced by the
 *     parsers, and upserts each row against the `(tenantId, externalCode)`
 *     dedupe key (falling back to `(tenantId, code)` when externalCode is
 *     absent).
 *   - Per-row failures are captured into `batch.errors` (bounded) and counted;
 *     a row never aborts the batch.
 *   - The batch status machine: PROCESSING -> (COMPLETED | PARTIAL | FAILED)
 *     with counters for imported/updated/skipped/failed.
 *
 * The engine always runs inside a tenant context (workers wrap jobs with
 * withTenantContext), so cross-tenant writes are impossible by construction.
 */

export interface ImportRowFailure {
  index: number;
  reason: string;
}

const MAX_STORED_ERRORS = 200;

export class ImportEngine {
  /**
   * Apply one normalized row. Returns 'created' | 'updated' | 'skipped'.
   * Skipped covers explicit status INACTIVE on import (kept silent by design)
   * as well as dedupe collisions that don't change anything.
   */
  static async upsertRow(tenantId: string, row: NormalizedPropertyRow): Promise<"created" | "updated" | "skipped"> {
    const data: Prisma.PropertyUncheckedCreateInput = {
      tenantId,
      code: row.code ?? row.externalCode ?? `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      externalCode: row.externalCode ?? null,
      title: row.title ?? "Imóvel importado",
      description: row.description ?? null,
      target: row.target ?? "SALE",
      category: row.category ?? "OTHER",
      status: row.status ?? "ACTIVE",
      salePrice: row.salePrice ?? null,
      rentPrice: row.rentPrice ?? null,
      condoFee: row.condoFee ?? null,
      propertyTax: row.propertyTax ?? null,
      address: row.address ?? null,
      number: row.number ?? null,
      city: row.city ?? "—",
      state: row.state ?? "—",
      neighborhood: row.neighborhood ?? null,
      zipCode: row.zipCode ?? null,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      area: row.area ?? null,
      bedrooms: row.bedrooms ?? null,
      suites: row.suites ?? null,
      bathrooms: row.bathrooms ?? null,
      parkingSpots: row.parkingSpots ?? null,
      isFeatured: row.isFeatured ?? false,
      isFurnished: row.isFurnished ?? false,
      isActive: true,
      slug: await ensureUniqueSlug(slugBaseFrom(row)),
      searchText: buildSearchText(row),
    };

    // Dedupe key preference: externalCode (portals) > code (ERP/CVS).
    const where: Prisma.PropertyWhereInput = row.externalCode
      ? { externalCode: row.externalCode }
      : { code: row.code };

    const existing = await prisma.property.findFirst({ where });

    if (existing) {
      // Keep the existing slug on update (public URLs must stay stable) unless
      // the row never had one — then mint one lazily.
      const slug = existing.slug ?? (await ensureUniqueSlug(slugBaseFrom(row), existing.id));
      // Soft-skip: nothing to change? Rows are always reapplied to refresh
      // pricing/status — an actual update therefore counts as `updated`.
      await prisma.property.update({
        where: { id: existing.id },
        data: {
          ...data,
          id: undefined,
          tenantId: undefined,
          code: existing.code,
          externalCode: existing.externalCode,
          slug,
        },
      });
      return "updated";
    }

    await prisma.property.create({ data });
    return "created";
  }

  /**
   * Run a batch end-to-end. Any thrown error re-throws; the workers' DLQ/retry
   * discipline decides whether the whole batch is worth retrying.
   */
  static async runBatch(batchId: string): Promise<{
    status: "COMPLETED" | "PARTIAL";
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
  }> {
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) {
      throw new Error(`ImportBatch ${batchId} not found.`);
    }
    const tenantId = batch.tenantId;

    return withTenantContext({ tenantId, tenantSlug: null, userId: null, role: null }, async () => {
      await prisma.importBatch.update({
        where: { id: batchId },
        data: { status: "PROCESSING", startedAt: new Date() },
      });

      const payload = batch.errors as unknown as { rows?: NormalizedPropertyRow[] } | null;
      const rows = payload?.rows ?? [];

      let imported = 0;
      let updated = 0;
      let skipped = 0;
      const failures: ImportRowFailure[] = [];

      for (const row of rows) {
        try {
          const action = await ImportEngine.upsertRow(tenantId, row);
          if (action === "created") imported++;
          else if (action === "updated") updated++;
          else skipped++;
        } catch (err) {
          failures.push({
            index: 0,
            reason: (err as Error).message.slice(0, 300),
          });
        }
      }

      const errors = (batch.errors as unknown as { errors?: ImportRowFailure[] } | null)?.errors ?? [];
      const allFailures = [...errors, ...failures].slice(0, MAX_STORED_ERRORS);

      const status = failedCount(failures) > 0 ? "PARTIAL" : "COMPLETED";
      await prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status,
          processedRows: rows.length,
          importedRows: imported,
          updatedRows: updated,
          skippedRows: skipped,
          failedRows: failures.length,
          errors: allFailures,
          finishedAt: new Date(),
        },
      });

      return { status, imported, updated, skipped, failed: failures.length };
    });
  }

  /** Enqueue a batch for asynchronous processing (idempotent by jobId). */
  static async enqueue(batchId: string): Promise<string> {
    // The batch row itself carries the ParseOutput rows; the queue job only
    // needs the id plus tenant context to run.
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new Error(`ImportBatch ${batchId} not found.`);
    return QueueManager.addPropertyImport({ tenantId: batch.tenantId, batchId });
  }
}

function failedCount(f: ImportRowFailure[]): number {
  return f.length;
}