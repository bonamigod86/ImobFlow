import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";

/**
 * GET /api/imports/[id]
 * Live status + full per-row error detail for one import batch.
 * Tenant-scoped via the ambient Prisma extension.
 */

type RouteParams = Record<string, string | string[] | undefined>;

function normalizeId(params: RouteParams): string | undefined {
  const id = params.id;
  return Array.isArray(id) ? id[0] : id;
}

export const GET = withApiRoute(ACTIONS.PROPERTIES_READ, async (_ctx, _req, params) => {
  const batch = await prisma.importBatch.findUnique({ where: { id: normalizeId(params) } });
  if (!batch) return fail(404, "NOT_FOUND", "Import batch not found.");

  // Return the full error detail for diagnostics; strip the embedded rows.
  const parsed = (batch.errors ?? {}) as { rows?: unknown[]; errors?: unknown[] };
  return ok({
    batch: {
      id: batch.id,
      source: batch.source,
      fileKind: batch.fileKind,
      fileName: batch.fileName,
      status: batch.status,
      totalRows: batch.totalRows,
      processedRows: batch.processedRows,
      importedRows: batch.importedRows,
      updatedRows: batch.updatedRows,
      skippedRows: batch.skippedRows,
      failedRows: batch.failedRows,
      startedAt: batch.startedAt,
      finishedAt: batch.finishedAt,
      createdAt: batch.createdAt,
    },
    errors: parsed.errors ?? [],
    validRowCount: Array.isArray(parsed.rows) ? parsed.rows.length : 0,
  });
});