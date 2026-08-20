import { describe, expect, it } from "vitest";
import {
  selectRoutingEndpoint,
  type RoutingCandidate,
} from "@/lib/leads/routing";

const cand = (over: Partial<RoutingCandidate>): RoutingCandidate => ({
  id: "r1",
  tenantId: null,
  name: "default",
  priority: 100,
  endpointId: "ep",
  ...over,
});

describe("selectRoutingEndpoint", () => {
  it("prefers tenant-scoped rules over platform defaults regardless of order", () => {
    const tenant = cand({ id: "r-tenant", tenantId: "t1", priority: 50, endpointId: "ep-tenant" });
    const platform = cand({ id: "r-platform", priority: 10, endpointId: "ep-platform" });
    const picked = selectRoutingEndpoint([platform, tenant], "t1", { city: "São Paulo" });
    expect(picked?.id).toBe("r-tenant");
  });

  it("uses platform fallback when no tenant rule matches", () => {
    const tenant = cand({ id: "r-t", tenantId: "t1", priority: 1, endpointId: "ep-t", state: "RJ" });
    const platform = cand({ id: "r-p", priority: 5, endpointId: "ep-p" });
    const picked = selectRoutingEndpoint([tenant, platform], "t1", {
      city: "São Paulo",
      state: "SP",
      monthlyIncome: 9000,
      propertyValue: 750000,
      termMonths: 240,
    });
    expect(picked?.id).toBe("r-p");
    expect(picked?.endpointId).toBe("ep-p");
  });

  it("splits by income tier (min/max inclusive)", () => {
    const worker = cand({
      id: "worker",
      endpointId: "ep-worker",
      minMonthlyIncome: 3000,
      maxMonthlyIncome: 8000,
    });
    const affluent = cand({
      id: "affluent",
      priority: 1,
      endpointId: "ep-wealth",
      minMonthlyIncome: 15000,
    });
    const rules = [affluent, worker];

    expect(selectRoutingEndpoint(rules, "t1", { monthlyIncome: 6000 })?.endpointId).toBe("ep-worker");
    expect(selectRoutingEndpoint(rules, "t1", { monthlyIncome: 20000 })?.endpointId).toBe("ep-wealth");
    expect(selectRoutingEndpoint(rules, "t1", { monthlyIncome: 3000 })?.endpointId).toBe("ep-worker");
  });

  it("respects property-value thresholds", () => {
    const mid = cand({ id: "mid", endpointId: "ep-mid", minPropertyValue: 200_000, maxPropertyValue: 800_000 });
    const rules = [mid, cand({ id: "all", priority: 200, endpointId: "ep-all" })];

    expect(selectRoutingEndpoint(rules, "t1", { propertyValue: 500_000 })?.endpointId).toBe("ep-mid");
    expect(selectRoutingEndpoint(rules, "t1", { propertyValue: 2_000_000 })?.endpointId).toBe("ep-all");
  });

  it("matches city/state case- and accent-insensitively", () => {
    const sp = cand({ id: "sp", endpointId: "ep-sp", city: "São Paulo", state: "SP" });
    const picked = selectRoutingEndpoint([sp], "t1", { city: "sao paulo", state: "sp" });
    expect(picked?.endpointId).toBe("ep-sp");
  });

  it("does not match a filtered geographic rule when the profile has no city", () => {
    const sp = cand({ id: "sp", endpointId: "ep-sp", city: "São Paulo" });
    const all = cand({ id: "all", priority: 50, endpointId: "ep-all" });
    expect(selectRoutingEndpoint([sp, all], "t1", { monthlyIncome: 8000 })?.endpointId).toBe("ep-all");
  });

  it("filters on term length when configured", () => {
    const long = cand({ id: "long", endpointId: "ep-long", minTermMonths: 300 });
    expect(selectRoutingEndpoint([long], "t1", { termMonths: 360 })?.endpointId).toBe("ep-long");
    expect(selectRoutingEndpoint([long], "t1", { termMonths: 120 })).toBeNull();
  });

  it("the most specific tenant rule wins by priority ASC", () => {
    const a = cand({ id: "a", tenantId: "t1", priority: 5, endpointId: "ep-a" });
    const b = cand({ id: "b", tenantId: "t1", priority: 3, endpointId: "ep-b", state: "RJ" });
    // For the same tenant, lower priority number = earlier evaluation.
    const picked = selectRoutingEndpoint([a, b], "t1", { state: "RJ" });
    expect(picked?.id).toBe("b");
  });

  it("returns null when nothing matches", () => {
    const only = cand({ id: "only", city: "Curitiba" });
    expect(selectRoutingEndpoint([only], "t1", { city: "São Paulo" })).toBeNull();
  });

  it("never selects a rule owned by another tenant (isolation)", () => {
    const foreign = cand({ id: "r-foreign", tenantId: "t2", priority: 1, endpointId: "ep-foreign" });
    const own = cand({ id: "r-own", tenantId: "t1", priority: 50, endpointId: "ep-own", city: "São Paulo" });
    const platform = cand({ id: "r-platform", priority: 200, endpointId: "ep-platform" });

    // Leads of tenant t1 ignore t2's rules entirely — even when they win on
    // order/priority — and fall back to own rules / platform defaults.
    const pickedT1 = selectRoutingEndpoint([foreign, own, platform], "t1", { city: "São Paulo" });
    expect(pickedT1?.endpointId).toBe("ep-own");

    const fallback = selectRoutingEndpoint([foreign, platform], "t1", { city: "Recife" });
    expect(fallback?.endpointId).toBe("ep-platform");

    // The same foreign rule still serves its owner (correct destination id).
    const pickedT2 = selectRoutingEndpoint([foreign, platform], "t2", { city: "Recife" });
    expect(pickedT2?.endpointId).toBe("ep-foreign");
  });
});