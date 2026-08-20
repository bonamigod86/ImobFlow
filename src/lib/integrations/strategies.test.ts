import { describe, expect, it } from "vitest";
import { buildLeadEnvelope } from "@/lib/integrations/envelope";
import { resolveAdapter, type LeadEnvelope } from "@/lib/integrations/strategies";

/** Minimal lead row shaped like the enriched Prisma return. */
const baseLead = {
  id: "lead-1",
  tenantId: "t-acme",
  name: "Marcos Silva",
  email: "marcos@example.com",
  phone: "+5511999990000",
  type: "BUYER",
  origin: "SITE_FORM",
  status: "NEW",
  propertyId: null,
  assignedToId: null,
  payload: { message: "Tenho interesse", utm: { source: "google", campaign: "lancamento" }, source: "portal" },
  createdAt: new Date("2026-08-19T12:00:00.000Z"),
  updatedAt: new Date("2026-08-19T12:00:00.000Z"),
} as const;

describe("buildLeadEnvelope", () => {
  it("serializes a plain lead with null property/finance sections", () => {
    const envelope = buildLeadEnvelope({ ...baseLead, property: null, financeProfile: null });

    expect(envelope.event).toBe("lead.created");
    expect(envelope.lead.id).toBe("lead-1");
    expect(envelope.lead.createdAt).toBe("2026-08-19T12:00:00.000Z");
    expect(envelope.property).toBeNull();
    expect(envelope.finance).toBeNull();
  });

  it("stringifies Decimal money values", () => {
    const salePrice = { toString: () => "750000.00" } as never;
    const envelope = buildLeadEnvelope({
      ...baseLead,
      property: {
        id: "p1",
        code: "ACA-001",
        title: "Apartamento Copacabana",
        city: "Rio de Janeiro",
        state: "RJ",
        neighborhood: "Copacabana",
        salePrice,
        rentPrice: null,
      },
      financeProfile: null,
    });

    expect(envelope.property?.salePrice).toBe("750000.00");
    expect(envelope.property?.rentPrice).toBeNull();
  });

  it("carries the financial profile when present", () => {
    const dec = (v: string) => ({ toString: () => v }) as never;
    const envelope = buildLeadEnvelope({
      ...baseLead,
      property: null,
      financeProfile: {
        id: "fp1",
        tenantId: "t-acme",
        leadId: "lead-1",
        propertyValue: dec("720000.00"),
        downPayment: dec("144000.00"),
        financingAmount: dec("576000.00"),
        monthlyIncome: dec("18000.00"),
        monthlyInstallmentLimit: dec("5500.00"),
        termMonths: 360,
        city: "São Paulo",
        state: "SP",
        createdAt: new Date("2026-08-19T12:00:00.000Z"),
      },
    });

    expect(envelope.finance?.monthlyIncome).toBe("18000.00");
    expect(envelope.finance?.termMonths).toBe(360);
  });
});

describe("resolveAdapter + adapters", () => {
  const envelope: LeadEnvelope = {
    event: "lead.created",
    lead: {
      id: "lead-1",
      name: "Marcos Silva",
      email: "marcos@example.com",
      phone: "+5511999990000",
      type: "BUYER",
      origin: "SITE_FORM",
      status: "NEW",
      tenantId: "t-acme",
      createdAt: "2026-08-19T12:00:00.000Z",
      payload: { message: "Oi", utm: { source: "google" }, source: "portal" },
    },
    property: {
      id: "p1",
      code: "ACA-001",
      title: "Apartamento Copacabana",
      city: "Rio de Janeiro",
      state: "RJ",
      neighborhood: "Copacabana",
      salePrice: "750000.00",
      rentPrice: null,
    },
    finance: null,
  };

  it("CUSTOM_JSON forwards the envelope untouched", () => {
    const out = resolveAdapter("CUSTOM_JSON")(envelope);
    expect(out).toEqual(envelope);
  });

  it("unknown strategies degrade to CUSTOM_JSON", () => {
    const adapter = resolveAdapter("MYSTERY_CRM" as never);
    expect(adapter(envelope)).toEqual(envelope);
  });

  it("CRM_DEFAULT maps fields + interest=rent for renters", () => {
    const out = resolveAdapter("CRM_DEFAULT")({ ...envelope, lead: { ...envelope.lead, type: "RENTER" } }) as Record<
      string,
      unknown
    >;
    expect(out.event).toBe("lead.created");
    expect((out.contact as { name: string }).name).toBe("Marcos Silva");
    expect((out.property as { code: string }).code).toBe("ACA-001");
    expect((out.property as { sale_price: number }).sale_price).toBe(750000);
    expect(out.interest).toBe("rent");
    expect((out.utm as { source: string }).source).toBe("google");
  });

  it("FINANCE_DEFAULT converts BRL decimals to numbers", () => {
    const finEnvelope: LeadEnvelope = {
      ...envelope,
      lead: { ...envelope.lead, type: "FINANCIAL" },
      finance: {
        propertyValue: "720000.00",
        downPayment: "144000.00",
        financingAmount: "576000.00",
        monthlyIncome: "18000.00",
        monthlyInstallmentLimit: "5500.00",
        termMonths: 360,
        city: "São Paulo",
        state: "SP",
      },
    };
    const out = resolveAdapter("FINANCE_DEFAULT")(finEnvelope) as {
      event: string;
      financial: {
        property_value: number;
        down_payment: number;
        financing_amount: number;
        monthly_income: number;
        monthly_installment_limit: number;
        term_months: number | null;
      };
      location: { city: string | null; state: string | null };
    };
    expect(out.event).toBe("acquisition.financial_request");
    expect(out.financial.property_value).toBe(720000);
    expect(out.financial.monthly_installment_limit).toBe(5500);
    expect(out.financial.term_months).toBe(360);
    expect(out.location.city).toBe("São Paulo");
  });
});