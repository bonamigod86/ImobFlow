import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma/client";
import { ImportEngine } from "@/lib/imports/import-engine";
import { parseCsv, parseJson, parseXml } from "@/lib/imports/parsers";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * POST /api/imports
 * Multi-format property import (VivaReal/ZAP XML, CSV, JSON).
 * The body is treated as RAW text (Content-Type: text/plain|application/xml|
 * text/csv|application/json). Rows are parsed & validated here (synchronously,
 * pure functions), the batch row + parse results are persisted, and the batch
 * is handed to the property-import queue for the async upsert/dedupe loop.
 *
 * GET /api/imports
 * Lists the tenant's import history with live status + counters.
 */

type RouteParams = Record<string, string | string[] | undefined>;

type FileKind = "XML" | "CSV" | "JSON";

const fileKindSchema = z.object({
  format: z.enum(["xml", "csv", "json"]).default("csv"),
  source: z
    .enum(["VIVA_REAL", "ZAP", "CSV", "REST_API", "MANUAL"])
    .default("MANUAL"),
  fileName: z.string().trim().max(255).optional(),
});

const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024; // 20MB raw text

function detectKind(format: string): FileKind {
  return format.toUpperCase() as FileKind;
}

export const POST = withApiRoute(ACTIONS.PROPERTIES_CREATE, async (ctx, req) => {
  const url = new URL(req.url);
  const meta = fileKindSchema.parse({
    format: url.searchParams.get("format") ?? "csv",
    source: url.searchParams.get("source") ?? "MANUAL",
    fileName: url.searchParams.get("fileName") ?? undefined,
  });

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_PAYLOAD_BYTES) {
    return fail(413, "PAYLOAD_TOO_LARGE", `Import payload exceeds ${MAX_PAYLOAD_BYTES / (1024 * 1024)}MB.`);
  }

  const kind = detectKind(meta.format);
  const parsed =
    kind === "XML" ? parseXml(raw)
    : kind === "JSON" ? parseJson(raw)
    : parseCsv(raw);

  const validRows = parsed.rows.filter((r) => r.ok).map((r) => r.data);
  const parseErrors = parsed.rows.filter((r) => !r.ok).map((r) => ({ index: r.index, reason: r.errors }));

  // Persist the batch with parse-time errors + valid rows embedded for the
  // worker to replay. Valid rows are stored compactly in `errors` payload
  // (rebuild via a dedicated column is unnecessary for Phase 2).
  const errorsPayload = { rows: validRows, errors: parseErrors } as unknown as Prisma.InputJsonValue;
  const batch = await prisma.importBatch.create({
    data: {
      tenantId: ctx.tenantId!,
      source: meta.source,
      fileKind: kind,
      fileName: meta.fileName ?? null,
      status: "QUEUED",
      totalRows: parsed.total,
      importedRows: 0,
      updatedRows: 0,
      skippedRows: 0,
      failedRows: parsed.invalid,
      errors: errorsPayload,
    } as Prisma.ImportBatchUncheckedCreateInput,
  });

  const jobId = await ImportEngine.enqueue(batch.id);

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_CREATED,
    entity: "ImportBatch",
    entityId: batch.id,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { kind, source: meta.source, total: parsed.total, valid: parsed.valid, jobId },
  });

  return ok(
    { batch: { id: batch.id, status: batch.status }, summary: { ...parsed }, jobId },
    202,
  );
});

export const GET = withApiRoute(ACTIONS.PROPERTIES_READ, async (_ctx, req) => {
  const page = Math.max(1, Number(new URL(req.url).searchParams.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("pageSize")) || 20));

  const [items, total] = await prisma.$transaction([
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        source: true,
        fileKind: true,
        fileName: true,
        status: true,
        totalRows: true,
        importedRows: true,
        updatedRows: true,
        skippedRows: true,
        failedRows: true,
        createdAt: true,
        finishedAt: true,
      },
    }),
    prisma.importBatch.count(),
  ]);

  return ok({ items, pagination: { page, pageSize, total } });
});