/** BullMQ queue names — one source of truth for producers and workers. */
export const QueueName = {
  LEAD_ROUTING: "lead-routing-queue",
  WEBHOOK_TRANSMISSION: "webhook-transmission-queue",
  MEDIA_PROCESSING: "media-processing-queue",
  PROPERTY_IMPORT: "property-import-queue",
  BILLING_SYNC: "billing-sync-queue",
  EMAIL_SEND: "email-send-queue",
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

/** The Dead-Letter variant of a queue (`<queue>-dlq`). */
export function dlqQueueName(name: QueueName): string {
  return `${name}-dlq`;
}