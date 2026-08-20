import { describe, expect, it } from "vitest";
import {
  consentSchema,
  publicFinancialLeadSchema,
  publicRealEstateLeadSchema,
} from "@/lib/validation/schemas";

describe("consentSchema (LGPD gate)", () => {
  it("requires an explicit grant (granted must be literally true)", () => {
    expect(consentSchema.safeParse({ granted: true }).success).toBe(true);
    expect(consentSchema.safeParse({ granted: false }).success).toBe(false);
    expect(consentSchema.safeParse({}).success).toBe(false);
  });

  it("defaults the consent version when omitted", () => {
    const parsed = consentSchema.parse({ granted: true });
    expect(parsed.textVersion).toBe("2026-08-19.v1");
  });
});

describe("publicRealEstateLeadSchema", () => {
  const valid = {
    propertyId: "p1",
    name: "Marcos",
    phone: "+5511999990000",
    consent: { granted: true },
  };

  it("rejects without consent", () => {
    const { consent: _ignored, ...noConsent } = valid;
    const res = publicRealEstateLeadSchema.safeParse(noConsent);
    expect(res.success).toBe(false);
  });

  it("normalizes utm to an object and keeps schedule", () => {
    const parsed = publicRealEstateLeadSchema.parse({
      ...valid,
      utm: { source: "google", campaign: "c1" },
      schedule: { date: "2026-09-01", time: "14:30" },
    });
    expect(parsed.utm).toEqual({ source: "google", campaign: "c1" });
    expect(parsed.schedule?.date).toBe("2026-09-01");
  });
});

describe("publicFinancialLeadSchema", () => {
  const base = {
    name: "Camila",
    email: "camila@example.com",
    phone: "+5511988887777",
    propertyValue: 720000,
    downPayment: 144000,
    monthlyIncome: 18000,
    monthlyInstallmentLimit: 5500,
    termMonths: 360,
    city: "São Paulo",
    state: "sp",
    consent: { granted: true },
  };

  it("upholds cash / term invariants and normalizes state case", () => {
    const parsed = publicFinancialLeadSchema.parse({ ...base, tenantSlug: "acme" });
    expect(parsed.state).toBe("SP");
    expect(parsed.downPayment).toBe(144000);
  });

  it("requires tenant scoping (propertyId or tenantSlug)", () => {
    expect(publicFinancialLeadSchema.safeParse(base).success).toBe(false);
    expect(publicFinancialLeadSchema.safeParse({ ...base, propertyId: "p1" }).success).toBe(true);
  });

  it("rejects negative income", () => {
    const res = publicFinancialLeadSchema.safeParse({
      ...base,
      propertyId: "p1",
      monthlyIncome: -1,
    });
    expect(res.success).toBe(false);
  });
});