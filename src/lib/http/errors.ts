import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { TenantContextRequiredError } from "@/lib/tenant/context";
import { ForbiddenError } from "@/lib/rbac/guards";
import { TenantInactiveError } from "@/lib/tenant/resolver";

/**
 * Standardized HTTP error surface + error -> Response mapper.
 * Every error type used across services converges here so route handlers never
 * translate exceptions ad-hoc.
 */

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(issues: unknown) {
    super(400, "VALIDATION_ERROR", "Payload validation failed.", issues);
    this.name = "ValidationError";
  }
}

interface ErrorBody {
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

function json(status: number, body: ErrorBody): NextResponse {
  return NextResponse.json(body, { status });
}

/** Map any thrown error to a safe HTTP response (never leaks internals). */
export function mapError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return json(400, {
      error: "VALIDATION_ERROR",
      message: "Request payload is invalid.",
      details: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  if (err instanceof AppError) {
    return json(err.status, {
      error: err.code,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof ForbiddenError) {
    return json(403, { error: "FORBIDDEN", message: err.message });
  }

  if (err instanceof TenantInactiveError) {
    return json(403, { error: "TENANT_INACTIVE", message: err.message });
  }

  if (err instanceof TenantContextRequiredError) {
    // Indicates a code bug (missing wrapper) rather than a client fault.
    console.error("[security] tenant context missing:", err.message);
    return json(500, {
      error: "TENANT_CONTEXT_MISSING",
      message: "Internal tenant-scope error.",
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return json(409, {
          error: "CONFLICT",
          message: "A record with the same unique value already exists.",
        });
      case "P2025":
        return json(404, { error: "NOT_FOUND", message: "Resource not found." });
      case "P2003":
        return json(409, { error: "FK_CONFLICT", message: "Referenced resource does not exist." });
      default:
        console.error("[prisma] unhandled known error:", err.code, err.message);
        return json(500, { error: "INTERNAL", message: "Internal error." });
    }
  }

  console.error("[api] unhandled error:", err);
  return json(500, { error: "INTERNAL", message: "Internal error." });
}

/** Convenience response builders used by route handlers. */
export function ok<T>(data: T, init?: number): NextResponse {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: code, message }, { status });
}