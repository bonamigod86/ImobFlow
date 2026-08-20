import { z } from "zod";
import { ACTIONS } from "@/lib/rbac/actions";
import { withApiRoute } from "@/lib/http/route-wrapper";
import { ok, fail } from "@/lib/http/errors";
import { ImportEngine } from "@/lib/imports/import-engine";
import { AuditService } from "@/lib/audit/audit-service";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";

/**
 * POST /api/properties/sync
 * Property synchronization endpoint for external systems (ERP, portals,
 * CRMs) and integrations that push catalog updates via REST/webhook.
 *
 * Accepts the same payloads as /api/imports — raw XML (VivaReal/ZAP), CSV or
 * JSON — and converges on the identical pipeline: normalize → persist
 * ImportBatch → async upsert/dedupe worker (source REST_API / VIVA_REAL / ZAP).
 *
 * Sync semantics (dedupe + status):
 *   - Rows are matched by (tenantId, externalCode), falling back to code.
 *   - Existing rows are UPDATED in place (pricing, status, address, features),
 *     so re-pushing the catalog is idempotent and keeps public URLs stable.
 *   - The row's `status` (ACTIVE/INACTIVE/SOLD/RENTED) is applied on upsert,
 *     enabling full catalog/inventory synchronization.
 *
 * Returns 202 with the batch id + job id; progress is observed via
 * GET /api/imports/{id} and GET /api/jobs/{jobId}.
 */

const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024; // 20MB raw text

const syncSchema = z.object({
  format: z.enum(["xml", "csv", "json"]).default("json"),
  source: z.enum(["VIVA_REAL", "ZAP", "CSV", "REST_API", "MANUAL"]).default("REST_API"),
  fileName: z.string().trim().max(255).optional(),
});

export const POST = withApiRoute(ACTIONS.PROPERTIES_CREATE, async (ctx, req) => {
  const url = new URL(req.url);
  const meta = syncSchema.parse({
    format: url.searchParams.get("format") ?? "json",
    source: url.searchParams.get("source") ?? "REST_API",
    fileName: url.searchParams.get("fileName") ?? undefined,
  });

  const raw = await req.text().catch(() => "");
  if (raw.length === 0) {
    return fail(400, "VALIDATION_ERROR", "Empty sync payload.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_PAYLOAD_BYTES) {
    return fail(413, "PAYLOAD_TOO_LARGE", `Sync payload exceeds ${MAX_PAYLOAD_BYTES / (1024 * 1024)}MB.`);
  }

  const { batchId, jobId, parsed } = await ImportEngine.submit({
    tenantId: ctx.tenantId!,
    raw,
    format: meta.format,
    source: meta.source,
    fileName: meta.fileName,
  });

  AuditService.logAsync({
    action: AUDIT_ACTIONS.PROPERTY_CREATED,
    entity: "ImportBatch",
    entityId: batchId,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    details: { kind: meta.format.toUpperCase(), source: meta.source, total: parsed.total, valid: parsed.valid, jobId, sync: true },
  });

  return ok(
    {
      batch: { id: batchId, status: "QUEUED" },
      summary: { ...parsed },
      jobId,
    },
    202,
  );
});