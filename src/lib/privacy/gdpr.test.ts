import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Privacy / LGPD contract (Checklist Item 20): consent view (versão/finalidade/
 * data/hora/IP/origem), withdrawal -> anonymization, and the retention sweep.
 */

const mocks = vi.hoisted(() => {
  const runDbTx = vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx));
  const tx = {
    leadConsent: { upsert: vi.fn(), update: vi.fn() },
    lead: { update: vi.fn() },
  };
  const prismaUnscoped = {
    lead: { findFirst: vi.fn() },
    leadConsent: { findMany: vi.fn() },
  };
  const eventBus = { emit: vi.fn(), on: vi.fn(), off: vi.fn() };
  return { runDbTx, tx, prismaUnscoped, eventBus };
});

vi.mock("@/lib/prisma/client", () => ({
  prisma: mocks.prismaUnscoped as never,
  prismaUnscoped: mocks.prismaUnscoped,
}));
vi.mock("@/lib/prisma/tx", () => ({ runDbTx: mocks.runDbTx }));
vi.mock("@/lib/events/event-bus", () => ({ eventBus: mocks.eventBus }));

import { getLeadPrivacy, withdrawConsent, runRetentionSweep } from "@/lib/privacy/gdpr";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLeadPrivacy", () => {
  it("returns consent + delivery trace", async () => {
    mocks.prismaUnscoped.lead.findFirst.mockResolvedValue({
      id: "lead-1",
      createdAt: new Date("2026-08-20T10:00:00Z"),
      email: "joao@x.com",
      type: "BUYER",
      consent: {
        textVersion: "2026-08-19.v1",
        consentText: "Autorizo…",
        grantedAt: new Date("2026-08-20T10:00:00Z"),
        ipAddress: "200.1.2.3",
        originUrl: "https://portal/imoveis",
        optedOut: false,
        optedOutAt: null,
      },
      deliveries: [
        { status: "DELIVERED", deliveredAt: new Date("2026-08-20T11:00:00Z"), attemptsCount: 1, endpoint: { name: "CRM", scope: "REAL_ESTATE" } },
      ],
    });

    const info = await getLeadPrivacy("t-acme", "lead-1");

    expect(info.consent).toMatchObject({
      version: "2026-08-19.v1",
      finalidade: "Autorizo…",
      ipAddress: "200.1.2.3",
      originUrl: "https://portal/imoveis",
    });
    expect(info.deliveries).toBe(1);
    expect(info.externalSends[0]?.endpoint).toContain("CRM");
  });

  it("throws for a lead outside the tenant", async () => {
    mocks.prismaUnscoped.lead.findFirst.mockResolvedValue(null);
    await expect(getLeadPrivacy("t-acme", "lead-other")).rejects.toThrow(/não encontrado/);
  });
});

describe("withdrawConsent", () => {
  it("marks opted-out and anonymizes the lead PII", async () => {
    mocks.prismaUnscoped.lead.findFirst.mockResolvedValue({ id: "lead-1", email: "joao@x.com" });
    mocks.tx.leadConsent.upsert.mockResolvedValue({ id: "c" });
    mocks.tx.lead.update.mockResolvedValue({ id: "lead-1" });

    await withdrawConsent("t-acme", "lead-1");

    const upsert = mocks.tx.leadConsent.upsert.mock.calls[0]![0]!;
    expect(upsert.where).toEqual({ leadId: "lead-1" });
    expect(upsert.create).toMatchObject({ optedOut: true });
    expect(mocks.tx.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: expect.objectContaining({ name: "[removido]", email: null, phone: null }),
    });
    expect(mocks.eventBus.emit).toHaveBeenCalledWith("consent.withdrawn", expect.objectContaining({ leadId: "lead-1" }));
  });
});

describe("runRetentionSweep", () => {
  it("anonymizes opted-out leads beyond the retention window", async () => {
    mocks.prismaUnscoped.leadConsent.findMany.mockResolvedValue([
      { leadId: "lead-1", tenantId: "t-acme" },
      { leadId: "lead-2", tenantId: "t-acme" },
    ]);

    const cleaned = await runRetentionSweep(30, new Date("2026-08-20T00:00:00Z"));

    expect(cleaned).toBe(2);
    expect(mocks.tx.lead.update).toHaveBeenCalledTimes(2);
    expect(mocks.eventBus.emit).toHaveBeenCalledWith("consent.retention_anonymized", expect.objectContaining({ leadId: "lead-2" }));
  });
});
