import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/http/errors";

/**
 * Lead engine capture + dispatch tests. `prismaUnscoped` and `QueueManager`
 * are mocked; the shared service under test stamps tenantId explicitly, so
 * we can assert isolation + consent + delivery wiring without PostgreSQL.
 */

type PrismaFn = ReturnType<typeof vi.fn>;
interface PrismaMockModels {
  property: { findFirst: PrismaFn };
  tenant: { findFirst: PrismaFn; findUnique: PrismaFn };
  lead: { create: PrismaFn };
  leadConsent: { create: PrismaFn };
  webhookEndpoint: { findMany: PrismaFn; findUnique: PrismaFn };
  routingRule: { findMany: PrismaFn };
  webhookDelivery: { upsert: PrismaFn };
  auditLog: { create: PrismaFn };
}

const mocks = vi.hoisted(() => {
  const prismaUnscoped = {
    property: { findFirst: vi.fn() },
    tenant: { findFirst: vi.fn(), findUnique: vi.fn() },
    lead: { create: vi.fn() },
    leadConsent: { create: vi.fn() },
    webhookEndpoint: { findMany: vi.fn(), findUnique: vi.fn() },
    routingRule: { findMany: vi.fn() },
    webhookDelivery: { upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  } as PrismaMockModels;
  const queueManager = { addLeadRouting: vi.fn(), addWebhookTransmission: vi.fn() };
  return { prismaUnscoped, queueManager };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.prismaUnscoped,
  prismaUnscoped: mocks.prismaUnscoped,
}));

vi.mock("@/lib/queues/queue-manager", () => ({
  QueueManager: mocks.queueManager,
}));

import { captureFinancialLead, captureRealEstateLead } from "@/lib/leads/lead-service";

const VISIBLE_PROPERTY = {
  id: "p1",
  tenantId: "t-acme",
  code: "ACA-001",
  title: "Apartamento Copacabana",
  city: "Rio de Janeiro",
  state: "RJ",
  target: "SALE",
  salePrice: { toString: () => "750000.00" },
  rentPrice: null,
};

const PTY = mocks.prismaUnscoped;
const QM = mocks.queueManager;

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(PTY).forEach((d) => void d);
  PTY.auditLog.create.mockResolvedValue({ id: "audit" });
  PTY.leadConsent.create.mockResolvedValue({ id: "consent" });
  PTY.tenant.findUnique.mockResolvedValue({ id: "t-acme", name: "Acme Corp" });
});

const client = { ipAddress: "200.1.2.3", userAgent: "portal-bot", originUrl: "https://portal/imoveis/p1" };

const RE_INPUT = {
  propertyId: "p1",
  name: "Marcos Silva",
  email: "marcos@example.com",
  phone: "+5511999990000",
  message: "Tenho interesse",
  schedule: null,
  utm: { source: "google", campaign: "launch" },
  consentTextVersion: "2026-08-19.v1",
  client,
};

describe("captureRealEstateLead", () => {
  it("persists the lead with the listing's tenant + consent + enqueues enrichment", async () => {
    PTY.property.findFirst.mockResolvedValue(VISIBLE_PROPERTY);
    PTY.lead.create.mockResolvedValue({
      id: "lead-1",
      tenantId: "t-acme",
      name: "Marcos Silva",
      type: "BUYER",
      status: "NEW",
    });
    PTY.webhookEndpoint.findMany.mockResolvedValue([]);
    QM.addLeadRouting.mockResolvedValue("route-job");

    const out = await captureRealEstateLead(RE_INPUT);

    expect(out.leadId).toBe("lead-1");
    expect(out.tenantId).toBe("t-acme");
    expect(out.routing).toBe("internal");

    const leadData = PTY.lead.create.mock.calls[0]![0]!.data;
    expect(leadData.tenantId).toBe("t-acme");
    expect(leadData.propertyId).toBe("p1");
    expect(leadData.consent).toBeUndefined(); // consent is persisted separately

    const consentData = PTY.leadConsent.create.mock.calls[0]![0]!.data;
    expect(consentData.leadId).toBe("lead-1");
    expect(consentData.tenantId).toBe("t-acme");
    expect(consentData.ipAddress).toBe("200.1.2.3");
    expect(consentData.originUrl).toBe("https://portal/imoveis/p1");
    expect(consentData.consentText).toContain("LGPD");

    expect(QM.addLeadRouting).toHaveBeenCalledWith({ tenantId: "t-acme", leadId: "lead-1" });
  });

  it("does NOT dispatch when no REAL_ESTATE endpoint is configured (internal routing)", async () => {
    PTY.property.findFirst.mockResolvedValue(VISIBLE_PROPERTY);
    PTY.lead.create.mockResolvedValue({ id: "lead-1", tenantId: "t-acme" });
    PTY.webhookEndpoint.findMany.mockResolvedValue([]);

    const out = await captureRealEstateLead(RE_INPUT);
    expect(out.deliveries).toHaveLength(0);
    expect(QM.addWebhookTransmission).not.toHaveBeenCalled();
  });

  it("creates one delivery + enqueue per ACTIVE REAL_ESTATE endpoint", async () => {
    PTY.property.findFirst.mockResolvedValue(VISIBLE_PROPERTY);
    PTY.lead.create.mockResolvedValue({ id: "lead-1", tenantId: "t-acme" });
    PTY.webhookEndpoint.findMany.mockResolvedValue([
      { id: "ep-crm", name: "CRM", baseUrl: "https://crm/leads", timeoutMs: 5000 },
    ]);
    PTY.webhookDelivery.upsert.mockResolvedValue({ id: "del-1", idempotencyKey: "k1" });
    QM.addWebhookTransmission.mockResolvedValue("job-1");

    const out = await captureRealEstateLead(RE_INPUT);

    expect(out.routing).toBe("external");
    expect(out.deliveries[0]).toMatchObject({ deliveryId: "del-1", endpointId: "ep-crm" });
    expect(QM.addWebhookTransmission).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-acme",
        integrationId: "ep-crm",
        eventId: "lead.created:lead-1",
        deliveryId: "del-1",
        url: "https://crm/leads",
      }),
    );
    expect(PTY.webhookDelivery.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          leadId: "lead-1",
          endpointId: "ep-crm",
          tenantId: "t-acme",
          idempotencyKey: expect.any(String),
        }),
      }),
    );
  });

  it("rejects unknown consent versions before persisting consent", async () => {
    PTY.property.findFirst.mockResolvedValue(VISIBLE_PROPERTY);
    PTY.lead.create.mockResolvedValue({ id: "lead-1", tenantId: "t-acme" });

    await expect(
      captureRealEstateLead({ ...RE_INPUT, consentTextVersion: "1999.old" }),
    ).rejects.toMatchObject({ status: 400, code: "CONSENT_VERSION_UNKNOWN" });
    expect(PTY.leadConsent.create).not.toHaveBeenCalled();
  });

  it("throws 404 when the listing is not publicly visible (tenant isolation)", async () => {
    PTY.property.findFirst.mockResolvedValue(null);
    await expect(captureRealEstateLead(RE_INPUT)).rejects.toMatchObject({ status: 404 });
    expect(PTY.lead.create).not.toHaveBeenCalled();
  });
});

describe("captureFinancialLead", () => {
  const FIN_INPUT = {
    name: "Camila Rocha",
    email: "camila@example.com",
    phone: "+5511988887777",
    propertyValue: 720_000,
    downPayment: 144_000,
    financingAmount: null,
    monthlyIncome: 18_000,
    monthlyInstallmentLimit: 5_500,
    termMonths: 360,
    city: "São Paulo",
    state: "SP",
    tenantSlug: null,
    propertyId: "p1",
    utm: { source: "financeiro" },
    consentTextVersion: "2026-08-19.v1",
    client,
  };

  it("requires tenant scoping (isolation by construction)", async () => {
    PTY.property.findFirst.mockResolvedValue(null);
    PTY.tenant.findFirst.mockResolvedValue(null);
    await expect(
      captureFinancialLead({ ...FIN_INPUT, propertyId: null, tenantSlug: null }),
    ).rejects.toMatchObject({ status: 404 });
    expect(PTY.lead.create).not.toHaveBeenCalled();
  });

  it("scopes by tenantSlug and stays internal when no rule matches", async () => {
    PTY.property.findFirst.mockResolvedValue(null);
    PTY.tenant.findFirst.mockResolvedValue({ id: "t-norton" });
    PTY.lead.create.mockResolvedValue({ id: "fin-1", tenantId: "t-norton", type: "FINANCIAL" });
    PTY.routingRule.findMany.mockResolvedValue([]);

    const out = await captureFinancialLead({ ...FIN_INPUT, propertyId: null, tenantSlug: "norton" });

    expect(out.leadId).toBe("fin-1");
    expect(out.tenantId).toBe("t-norton");
    expect(out.routing).toBe("internal");
    expect(QM.addWebhookTransmission).not.toHaveBeenCalled();
  });

  it("routes to the matched partner endpoint with finance profile details", async () => {
    PTY.property.findFirst.mockResolvedValue(VISIBLE_PROPERTY);
    PTY.lead.create.mockResolvedValue({ id: "fin-1", tenantId: "t-acme", type: "FINANCIAL" });
    PTY.routingRule.findMany.mockResolvedValue([
      {
        id: "rule-1",
        tenantId: null,
        name: "SP default",
        priority: 10,
        endpointId: "ep-cred",
        city: null,
        state: "SP",
        minMonthlyIncome: null,
        maxMonthlyIncome: null,
        minPropertyValue: null,
        maxPropertyValue: { toString: () => "1500000" },
        minTermMonths: null,
        maxTermMonths: null,
        endpoint: { id: "ep-cred", name: "CredFÃ¡cil" },
      },
    ]);
    PTY.webhookEndpoint.findUnique.mockResolvedValue({
      baseUrl: "https://webhook.cred.example.com/api/lead-acquisition",
      timeoutMs: 10000,
    });
    PTY.webhookDelivery.upsert.mockResolvedValue({ id: "del-fin", idempotencyKey: "kf" });
    QM.addWebhookTransmission.mockResolvedValue("job-fin");

    const out = await captureFinancialLead(FIN_INPUT);

    expect(out.routing).toBe("external");
    expect(out.deliveries[0]).toMatchObject({
      deliveryId: "del-fin",
      endpointId: "ep-cred",
      endpointName: "CredFÃ¡cil",
      matchedRuleId: "rule-1",
    });

    const leadData = PTY.lead.create.mock.calls[0]![0]!.data;
    expect(leadData.tenantId).toBe("t-acme");
    expect(leadData.type).toBe("FINANCIAL");
    expect(leadData.financeProfile.create).toMatchObject({
      tenantId: "t-acme",
      propertyValue: 720_000,
      downPayment: 144_000,
      termMonths: 360,
    });

    expect(QM.addWebhookTransmission).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "ep-cred",
        eventId: "lead.created:fin-1",
        deliveryId: "del-fin",
      }),
    );
  });
});