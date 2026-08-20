/**
 * Job payload contracts shared by producers and workers.
 * Every job MUST carry `tenantId` so a worker can open the correct tenant
 * context before touching tenant-scoped data.
 */

export interface BaseJobData {
  tenantId: string;
}

export interface LeadRoutingJobData extends BaseJobData {
  leadId: string;
}

export interface WebhookTransmissionJobData extends BaseJobData {
  integrationId: string;
  eventId: string;
  url: string;
  method: "POST" | "PUT" | "PATCH";
  headers?: Record<string, string>;
  payload: unknown;
  timeoutMs?: number;
  /**
   * Present for lead.dispatch deliveries. The worker loads the delivery + lead
   * from the DB, formats via the endpoint strategy and HMAC-signs the body —
   * the static `payload` field is ignored for this path.
   */
  deliveryId?: string;
  attemptNumber?: number;
}

export interface MediaProcessingJobData extends BaseJobData {
  mediaId: string;
  propertyId: string;
  /** Storage key of the original upload (already in the bucket). */
  sourceKey: string;
  /** Resize strategy set — when absent the worker uses the tenant defaults. */
  sizes?: Array<{ label: string; width: number; height: number; fit: "cover" | "inside" }>;
  watermarkKey?: string;
}

export interface PropertyImportJobData extends BaseJobData {
  batchId: string;
}

/**
 * Billing dunning sweep. This job is platform-level (no tenant) — it walks the
 * whole subscription table, so `BillingSyncJobData` intentionally does NOT
 * extend BaseJobData. The worker uses prismaUnscoped explicitly.
 */
export interface BillingSyncJobData {
  scope: "global-scan";
}

/**
 * Transactional e-mail delivery (Phase 6). Transport-only: the message is
 * fully rendered at dispatch time and the worker performs no DB access, so no
 * tenant context is required (like BillingSyncJobData, intentionally NOT
 * extending BaseJobData). `jobId` is the stable `dedupeKey` from the renderer,
 * which makes double-dispatches idempotent at the queue level.
 */
export interface EmailSendJobData {
  /** `event:to:payloadHash` dedupe key — hashed into the BullMQ jobId. */
  dedupeKey: string;
  event: string;
  toEmail: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

export type JobData =
  | LeadRoutingJobData
  | WebhookTransmissionJobData
  | MediaProcessingJobData
  | PropertyImportJobData
  | BillingSyncJobData
  | EmailSendJobData;

export type RetryableJobData<T> = T extends BaseJobData ? T : never;