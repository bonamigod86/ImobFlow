import type {
  FinancialLeadProfile,
  Lead,
  Property,
} from "@prisma/client";
import type { LeadEnvelope } from "@/lib/integrations/strategies";

/**
 * Build a strategy-agnostic lead envelope from persisted rows. Money decimals
 * are stringified so adapters can safely coerce/reformat them.
 */

type LeadWithRelations = Lead & {
  property?: Pick<
    Property,
    "id" | "code" | "title" | "city" | "state" | "neighborhood" | "salePrice" | "rentPrice"
  > | null;
  financeProfile?: FinancialLeadProfile | null;
};

const money = (v: DecimalLike | null | undefined): string | null => {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : (v as { toString(): string }).toString();
};

type DecimalLike = { toString(): string } | null | undefined;

export function buildLeadEnvelope(lead: LeadWithRelations): LeadEnvelope {
  const payload = (lead.payload ?? {}) as Record<string, unknown> | null;

  return {
    event: "lead.created",
    lead: {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      type: lead.type,
      origin: lead.origin,
      status: lead.status,
      tenantId: lead.tenantId,
      createdAt: lead.createdAt.toISOString(),
      payload,
    },
    property: lead.property
      ? {
          id: lead.property.id,
          code: lead.property.code,
          title: lead.property.title,
          city: lead.property.city,
          state: lead.property.state,
          neighborhood: lead.property.neighborhood,
          salePrice: money(lead.property.salePrice),
          rentPrice: money(lead.property.rentPrice),
        }
      : null,
    finance: lead.financeProfile
      ? {
          propertyValue: money(lead.financeProfile.propertyValue),
          downPayment: money(lead.financeProfile.downPayment),
          financingAmount: money(lead.financeProfile.financingAmount),
          monthlyIncome: money(lead.financeProfile.monthlyIncome),
          monthlyInstallmentLimit: money(lead.financeProfile.monthlyInstallmentLimit),
          termMonths: lead.financeProfile.termMonths,
          city: lead.financeProfile.city,
          state: lead.financeProfile.state,
        }
      : null,
  };
}