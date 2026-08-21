import { afterEach, describe, expect, it, vi } from "vitest";
import { logHttpRequest } from "@/lib/http/logger";

/**
 * Structured request logger contract (Checklist Item 22): one JSON line per
 * request with request-id, latency, status and identity; 5xx on stderr.
 */

describe("logHttpRequest", () => {
  const info = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

  afterEach(() => {
    info.mockClear();
    error.mockClear();
  });

  it("emits a JSON line with latency and identity", () => {
    logHttpRequest({ requestId: "req_123", ipAddress: "1.2.3.4", userId: "u-1", tenantId: "t-1", method: "POST", path: "/api/properties", status: 201, durationMs: 42 });

    const line = info.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.type).toBe("request");
    expect(parsed.request).toMatchObject({ id: "req_123", method: "POST", path: "/api/properties", userId: "u-1", tenantId: "t-1" });
    expect(parsed.response).toMatchObject({ status: 201, durationMs: 42 });
    expect(error).not.toHaveBeenCalled();
  });

  it("routes 5xx to stderr for error monitoring", () => {
    logHttpRequest({ requestId: null, ipAddress: null, userId: null, tenantId: null, method: "GET", path: "/api/leads/x", status: 500, durationMs: 130 });
    const line = error.mock.calls[0]?.[0] as string;
    expect(JSON.parse(line).response.status).toBe(500);
    expect(info).not.toHaveBeenCalled();
  });
});