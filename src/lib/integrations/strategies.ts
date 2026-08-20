import type { WebhookStrategy } from "@prisma/client";

/**
 * Canonical, strategy-independent lead envelope handed to every adapter. Built
 * from the persisted lead + relations by `buildLeadEnvelope` (envelope.ts) and
 * then shaped per destination by a strategy adapter. Decimal money values are
 * pre-converted to strings to avoid BigInt/serialization surprises.
 */
export interface LeadEnvelope {
  event: "lead.created";
  lead: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    type: string;
    origin: string;
    status: string;
    tenantId: string;
    createdAt: string;
    payload: Record<string, unknown> | null;
  };
  property?: {
    id: string;
    code: string;
    title: string;
    city: string | null;
    state: string | null;
    neighborhood: string | null;
    salePrice: string | null;
    rentPrice: string | null;
  } | null;
  finance?: {
    propertyValue: string | null;
    downPayment: string | null;
    financingAmount: string | null;
    monthlyIncome: string | null;
    monthlyInstallmentLimit: string | null;
    termMonths: number | null;
    city: string | null;
    state: string | null;
  } | null;
}

/** Signature of a payload adapter. Pure JSON-in/JSON-out. */
export type PayloadAdapter = (envelope: LeadEnvelope) => Record<string, unknown>;

const asNumber = (raw: string | null): number | null => {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** Identity-styled adapter: forwards the normalized envelope untouched. */
function customJson(envelope: LeadEnvelope): Record<string, unknown> {
  return envelope as unknown as Record<string, unknown>;
}

/**
 * Real-estate CRM contract (e.g. Vivo Sales / RD Station style):
 * interested-party record joined to the listing they inquired about.
 */
function crmDefault(envelope: LeadEnvelope): Record<string, unknown> {
  const { lead, property } = envelope;
  const payload = (lead.payload ?? {}) as Record<string, unknown>;
  const utm = (payload.utm ?? {}) as Record<string, unknown>;

  return {
    event: "lead.created",
    lead_id: lead.id,
    tenant_id: lead.tenantId,
    contact: {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    },
    property: property
      ? {
          id: property.id,
          code: property.code,
          title: property.title,
          location: [property.city, property.state].filter(Boolean).join("/") || null,
          neighborhood: property.neighborhood,
          sale_price: asNumber(property.salePrice),
          rent_price: asNumber(property.rentPrice),
        }
      : null,
    interest: lead.type === "RENTER" ? "rent" : "buy",
    interest_type: typeof payload.interestType === "string" ? payload.interestType : null,
    source: lead.origin.toLowerCase(),
    utm,
    message: typeof payload.message === "string" ? payload.message : null,
    created_at: lead.createdAt,
  };
}

/**
 * Partner financing contract (acquired-loan / credit originator): the financial
 * profile a credit partner needs to quote — always BRL values. Carries origin +
 * interest type + property reference so the receiver identifies the source,
 * the listing and the requested intent (checklist item 10).
 */
function financeDefault(envelope: LeadEnvelope): Record<string, unknown> {
  const { lead, finance, property } = envelope;
  const payload = (lead.payload ?? {}) as Record<string, unknown>;
  return {
    event: "acquisition.financial_request",
    lead_id: lead.id,
    tenant_id: lead.tenantId,
    origin: lead.origin.toLowerCase(),
    interest_type: typeof payload.interestType === "string" ? payload.interestType : null,
    contact: {
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    },
    property: property
      ? {
          id: property.id,
          code: property.code,
        }
      : null,
    financial: {
      property_value: asNumber(finance?.propertyValue ?? null),
      down_payment: asNumber(finance?.downPayment ?? null),
      financing_amount: asNumber(finance?.financingAmount ?? null),
      monthly_income: asNumber(finance?.monthlyIncome ?? null),
      monthly_installment_limit: asNumber(finance?.monthlyInstallmentLimit ?? null),
      term_months: finance?.termMonths ?? null,
    },
    location: {
      city: finance?.city ?? null,
      state: finance?.state ?? null,
    },
    created_at: lead.createdAt,
  };
}

export const ADAPTERS: Record<WebhookStrategy, PayloadAdapter> = {
  CUSTOM_JSON: customJson,
  FINANCE_DEFAULT: financeDefault,
  CRM_DEFAULT: crmDefault,
};

/**
 * Resolve the adapter for a strategy id. Unknown/nil strategies degrade to the
 * identity adapter — forwarding is always better than dropping a lead.
 */
export function resolveAdapter(strategy: string | null | undefined): PayloadAdapter {
  return ADAPTERS[(strategy as WebhookStrategy) in ADAPTERS ? (strategy as WebhookStrategy) : "CUSTOM_JSON"];
}