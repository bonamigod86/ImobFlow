import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { middleware } from "@/middleware";
import { signSessionToken } from "@/lib/auth/jwt";
import {
  withTenantFilter,
  assertIdWhere,
  isTenantScoped,
} from "@/lib/prisma/tenant-extension";

/**
 * DATA SEGREGATION AUDIT (Phase 6, item 3).
 *
 * Three automated layers prove a Tenant A principal can never read/update/delete
 * Tenant B records:
 *
 *  1. Static API-surface scan — every non-public API route MUST be wrapped by
 *     `withApiRoute` (RBAC + tenant-context gate). A route added later without
 *     the wrapper fails this suite immediately.
 *  2. Middleware tenant-boundary test — a signed Tenant-B session calling a
 *     Tenant-A host is rejected before any handler runs.
 *  3. ORM fail-closed contract — the tenant-extension always folds `tenantId`
 *     into where-clauses and refuses id-less update/delete.
 */

const PUBLIC_ROUTES = new Set([
  "health",
  "auth/login",
  "auth/logout",
  "auth/forgot-password",
  "auth/reset-password",
  "billing/webhooks",
  "public/leads",
  "public/listings",
  "public/financial-leads",
  "register",
]);

const ROUTES_ROOT = path.resolve(process.cwd(), "src/app/api");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

function listApiRoutes(): Array<{ rel: string; file: string }> {
  return walk(ROUTES_ROOT)
    .map((file) => ({
      file,
      rel: path.relative(ROUTES_ROOT, file).replace(/\\/g, "/").replace(/\/route\.ts$/, ""),
    }))
    .filter((r) => r.rel !== "");
}

describe("Layer 1 — API surface: every protected route uses withApiRoute", () => {
  it("covers all non-public endpoints", () => {
    const offenders: string[] = [];
    for (const { file, rel } of listApiRoutes()) {
      if (PUBLIC_ROUTES.has(rel)) continue;
      const content = readFileSync(file, "utf8");
      if (!content.includes("withApiRoute")) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe("Layer 2 — middleware enforces the tenant boundary before handlers", () => {
  it("rejects a Tenant-B session calling a Tenant-A host (403)", async () => {
    const token = await signSessionToken({
      userId: "user-b",
      tenantId: "tenant-b",
      tenantSlug: "norton",
      role: "OWNER",
      email: "owner@norton.com",
      name: "B Owner",
    });
    const req = new NextRequest("https://acme.saas.local/api/properties", {
      headers: {
        cookie: `${process.env.SESSION_COOKIE}=${token}`,
        "x-requested-tenant-slug": "acme",
      },
    });
    const res: NextResponse = await middleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("TENANT_MISMATCH");
  });

  it("lets a MASTER session pass across tenants (passthrough)", async () => {
    const token = await signSessionToken({
      userId: "master",
      tenantId: null,
      tenantSlug: null,
      role: "MASTER",
      email: "admin@saas.local",
      name: "Admin",
    });
    const req = new NextRequest("https://acme.saas.local/api/admin/tenants", {
      headers: { cookie: `${process.env.SESSION_COOKIE}=${token}` },
    });
    const res = await middleware(req);
    expect(res.status).toBe(200);
  });

  it("returns 401 for anonymous access to a protected API path", async () => {
    const req = new NextRequest("https://acme.saas.local/api/properties");
    const res = await middleware(req);
    expect(res.status).toBe(401);
  });
});

describe("Layer 3 — ORM extension folds tenantId into every query", () => {
  it("injects tenantId into bare where-clauses", () => {
    expect(withTenantFilter(undefined, "t-a")).toEqual({ tenantId: "t-a" });
    expect(withTenantFilter({}, "t-a")).toEqual({
      AND: [{}, { tenantId: "t-a" }],
    });
  });

  it("ANDs with the caller filter without clobbering it", () => {
    const filtered = withTenantFilter({ id: "prop-1" }, "t-a");
    expect(filtered.AND[0]).toEqual({ id: "prop-1" });
    expect(filtered.AND[1]).toEqual({ tenantId: "t-a" });
  });

  it("returns zero rows when the caller spoofs another tenantId", () => {
    const filtered = withTenantFilter({ tenantId: "t-b", id: "x" }, "t-a");
    expect(filtered.AND[0].tenantId).toBe("t-b");
    expect(filtered.AND[1].tenantId).toBe("t-a");
  });

  it("refuses update/delete without an id in where (fail-closed)", () => {
    expect(() => assertIdWhere("update", { city: "SP" })).toThrow();
    expect(() => assertIdWhere("delete", undefined)).toThrow();
    expect(() => assertIdWhere("update", { id: "ok" })).not.toThrow();
  });

  it("classifies tenant-owned models as tenant-scoped", () => {
    for (const model of [
      "Property",
      "Lead",
      "LeadConsent",
      "FinancialLeadProfile",
      "TenantSubscription",
      "PaymentInvoice",
      "HighlightCreditLedger",
      "WebhookDelivery",
    ]) {
      expect(isTenantScoped(model)).toBe(true);
    }
    expect(isTenantScoped("Tenant")).toBe(false);
    expect(isTenantScoped("Plan")).toBe(false);
  });
});