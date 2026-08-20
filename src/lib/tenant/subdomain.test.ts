import { afterEach, describe, expect, it } from "vitest";
import { getTenantSlugFromHost, slugify } from "@/lib/tenant/subdomain";

const original = process.env.APP_DOMAIN;

afterEach(() => {
  process.env.APP_DOMAIN = original;
});

describe("getTenantSlugFromHost", () => {
  it("resolves a subdomain against APP_DOMAIN", () => {
    process.env.APP_DOMAIN = "app.saas.local";
    expect(getTenantSlugFromHost("acme.app.saas.local")).toBe("acme");
    expect(getTenantSlugFromHost("acme.app.saas.local:3000")).toBe("acme");
  });

  it("returns null for the bare root domain", () => {
    process.env.APP_DOMAIN = "app.saas.local";
    expect(getTenantSlugFromHost("app.saas.local")).toBeNull();
    expect(getTenantSlugFromHost("www.app.saas.local")).toBeNull();
  });

  it("strips ports and case", () => {
    process.env.APP_DOMAIN = "";
    expect(getTenantSlugFromHost("AcME.localhost:3000")).toBe("acme");
  });

  it("ignores reserved label on bare localhost dev", () => {
    process.env.APP_DOMAIN = "";
    expect(getTenantSlugFromHost("www.localhost")).toBeNull();
    expect(getTenantSlugFromHost("api.localhost")).toBeNull();
    expect(getTenantSlugFromHost("localhost")).toBeNull();
    expect(getTenantSlugFromHost("127.0.0.1")).toBeNull();
  });

  it("treats a bare first label as the tenant on localhost dev", () => {
    process.env.APP_DOMAIN = "";
    expect(getTenantSlugFromHost("acme.localhost")).toBe("acme");
    expect(getTenantSlugFromHost("acme.localhost:3000")).toBe("acme");
  });

  it("never guesses on foreign hosts", () => {
    process.env.APP_DOMAIN = "saas.local";
    expect(getTenantSlugFromHost("somewhere-else.com")).toBeNull();
  });

  it("handles null/empty", () => {
    expect(getTenantSlugFromHost(null)).toBeNull();
    expect(getTenantSlugFromHost("")).toBeNull();
  });
});

describe("slugify", () => {
  it("normalizes into kebab-case", () => {
    expect(slugify("ACME Imóveis!")).toBe("acme-im-veis");
    expect(slugify("  Acme  Realty  ")).toBe("acme-realty");
    expect(slugify("---dup---")).toBe("dup");
  });
});