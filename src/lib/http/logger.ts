/**
 * Structured request logger (Checklist Item 22 — "logs, observabilidade").
 *
 * Emits one JSON line per protected API request with the request-id already
 * captured at the edge, response status and latency — the spine of tracing and
 * of latency/error dashboards. 5xx are surfaced on stderr, everything else on
 * stdout, so a collector can route them independently.
 */

export interface RequestLogFields {
  requestId: string | null;
  ipAddress: string | null;
  userId: string | null;
  tenantId: string | null;
  method: string;
  path: string;
  status: number;
  durationMs: number;
}

export function logHttpRequest(fields: RequestLogFields): void {
  const entry = {
    ts: new Date().toISOString(),
    level: "http",
    type: "request",
    app: {
      env: process.env.NODE_ENV ?? "development",
      ring: process.env.APP_ENV ?? "development",
    },
    request: {
      id: fields.requestId,
      ip: fields.ipAddress,
      userId: fields.userId,
      tenantId: fields.tenantId,
      method: fields.method,
      path: fields.path,
    },
    response: {
      status: fields.status,
      durationMs: fields.durationMs,
    },
  };
  const line = JSON.stringify(entry);
  if (fields.status >= 500) console.error(line);
  else console.log(line);
}
