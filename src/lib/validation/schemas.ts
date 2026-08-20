import { z } from "zod";
import { MAX_PASSWORD_LENGTH } from "@/lib/auth/password";

/**
 * Zod contracts for every request boundary.
 * Centralized so API routes, server actions and future consumers share one
 * validation definition and error vocabulary.
 */

export const loginSchema = z.object({
  email: z.string().trim().email("A valid e-mail is required.").max(255),
  password: z
    .string()
    .min(1, "Password is required.")
    .max(MAX_PASSWORD_LENGTH, "Password is too long."),
  tenantSlug: z.string().trim().toLowerCase().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const propertySchema = z
  .object({
    code: z.string().trim().min(1, "code is required").max(40),
    externalCode: z.string().trim().max(120).optional().nullable(),
    title: z.string().trim().min(1, "title is required").max(255),
    description: z.string().trim().max(5000).optional().nullable(),
    target: z.enum(["SALE", "RENT", "BOTH"]).default("SALE"),
    category: z
      .enum(["APARTMENT", "HOUSE", "COMMERCIAL", "LAND", "FARM", "OFFICE", "GARAGE", "OTHER"])
      .default("APARTMENT"),
    status: z.enum(["ACTIVE", "INACTIVE", "SOLD", "RENTED"]).default("ACTIVE"),
    salePrice: z.coerce.number().positive("salePrice must be positive").max(1e12).optional().nullable(),
    rentPrice: z.coerce.number().positive("rentPrice must be positive").max(1e12).optional().nullable(),
    condoFee: z.coerce.number().nonnegative().max(1e12).optional().nullable(),
    propertyTax: z.coerce.number().nonnegative().max(1e12).optional().nullable(),
    address: z.string().trim().max(255).optional().nullable(),
    number: z.string().trim().max(20).optional().nullable(),
    city: z.string().trim().min(1, "city is required").max(120),
    state: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/, "state must be a two-letter UF code (e.g. SP)")
      .transform((v) => v.toUpperCase()),
    neighborhood: z.string().trim().max(120).optional().nullable(),
    zipCode: z.string().trim().max(12).optional().nullable(),
    latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
    longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
    area: z.coerce.number().nonnegative().max(1e9).optional().nullable(),
    bedrooms: z.coerce.number().int().nonnegative().max(100).optional().nullable(),
    suites: z.coerce.number().int().nonnegative().max(100).optional().nullable(),
    bathrooms: z.coerce.number().int().nonnegative().max(100).optional().nullable(),
    parkingSpots: z.coerce.number().int().nonnegative().max(100).optional().nullable(),
    isFeatured: z.boolean().optional().default(false),
    isFurnished: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
  })
  .refine(
    (v) => v.salePrice != null || v.rentPrice != null,
    { message: "at least one of salePrice or rentPrice is required (matching target)", path: ["salePrice"] },
  );

/** Same shape minus the cross-field pricing rule, used for PATCH payloads. */
export const propertyPatchSchema = propertySchema.innerType().partial();

export type PropertyInput = z.infer<typeof propertySchema>;
export type PropertyPatchInput = z.input<typeof propertyPatchSchema> & {
  code?: string;
  title?: string;
  salePrice?: number | null;
  rentPrice?: number | null;
  condoFee?: number | null;
  propertyTax?: number | null;
  isFeatured?: boolean;
  isFurnished?: boolean;
  isActive?: boolean;
};

export const leadSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(255),
  email: z.string().trim().email("A valid e-mail is required.").max(255).optional().or(z.literal("")),
  phone: z.string().trim().min(8).max(30).optional().or(z.literal("")),
  type: z.enum(["BUYER", "SELLER", "RENTER", "INVESTOR", "FINANCIAL"]).default("BUYER"),
  origin: z.enum([
    "SITE_FORM",
    "PORTAL",
    "SOCIAL_MEDIA",
    "PHONE_CALL",
    "INDICATION",
    "MANUAL",
    "INTEGRATION",
  ]).default("SITE_FORM"),
  payload: z.record(z.unknown()).optional().default({}),
});

export type LeadInput = z.infer<typeof leadSchema>;

// -----------------------------------------------------------------------------
// Phase 4 — Lead Engine (LGPD consent, UTM, financial capture)
// -----------------------------------------------------------------------------

/** Marketing attribution params captured verbatim into the lead payload. */
export const utmSchema = z
  .object({
    source: z.string().trim().max(120).optional().default(""),
    medium: z.string().trim().max(120).optional().default(""),
    campaign: z.string().trim().max(120).optional().default(""),
    content: z.string().trim().max(120).optional().default(""),
    term: z.string().trim().max(120).optional().default(""),
  })
  .transform((v) => {
    const utm: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) if (val) utm[k] = val;
    return utm;
  });

export type UtmInput = z.infer<typeof utmSchema>;

/**
 * LGPD consent gate. The client asserts a grant; the server resolves the exact
 * statement text by version (server-owned, see src/lib/leads/consent.ts) and
 * rejects unknown/legacy versions. The IP + origin URL are stamped server-side.
 */
export const consentSchema = z.object({
  granted: z.literal(true, { errorMap: () => ({ message: "Consentimento LGPD é obrigatório." }) }),
  textVersion: z.string().trim().default("2026-08-19.v1"),
});

export type ConsentInput = z.infer<typeof consentSchema>;

/** Public intake for a real-estate lead (portal PDP / landing quick forms). */
export const publicRealEstateLeadSchema = z.object({
  propertyId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1, "Informe seu nome.").max(255),
  email: z.string().trim().email("E-mail inválido.").max(255).optional().or(z.literal("")),
  phone: z.string().trim().min(8, "Informe um telefone com DDD.").max(30).optional().or(z.literal("")),
  message: z.string().trim().max(2000).optional(),
  schedule: z
    .object({
      date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.").optional(),
      time: z.string().trim().regex(/^\d{2}:\d{2}$/, "Horário inválido.").optional(),
    })
    .optional(),
  utm: utmSchema.optional().default({}),
  consent: consentSchema,
});

export type PublicRealEstateLeadInput = z.infer<typeof publicRealEstateLeadSchema>;

/** Public intake for a financial/acquisition lead (credit partner funnel). */
export const publicFinancialLeadSchema = z
  .object({
    name: z.string().trim().min(1, "Informe seu nome.").max(255),
    email: z.string().trim().email("E-mail inválido.").max(255),
    phone: z.string().trim().min(8, "Informe um telefone com DDD.").max(30),
    propertyValue: z.coerce.number().positive("Informe o valor do imóvel.").max(1e12),
    downPayment: z.coerce.number().nonnegative().max(1e12),
    financingAmount: z.coerce.number().nonnegative().max(1e12).optional(),
    monthlyIncome: z.coerce.number().nonnegative("Informe sua renda aproximada.").max(1e12),
    monthlyInstallmentLimit: z.coerce.number().nonnegative().max(1e12),
    termMonths: z.coerce.number().int().min(1, "Informe o prazo em meses.").max(480),
    city: z.string().trim().min(1, "Informe a cidade.").max(120),
    state: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "UF inválida.")
      .transform((v) => v.toUpperCase()),
    /// Tenant scoping for unattributed funnels: either a listing (derives the
    /// tenant from the property) or an explicit tenant slug. At least one is
    /// required so a public financial lead is never tenant-less.
    propertyId: z.string().trim().min(1).max(64).optional(),
    tenantSlug: z.string().trim().toLowerCase().max(120).optional(),
    utm: utmSchema.optional().default({}),
    consent: consentSchema,
  })
  .refine((v) => v.propertyId || v.tenantSlug, {
    message: "propertyId or tenantSlug is required to scope this lead.",
    path: ["tenantSlug"],
  });

export type PublicFinancialLeadInput = z.infer<typeof publicFinancialLeadSchema>;

/** Outbound webhook endpoint (integration) management. */
export const webhookEndpointSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(160),
  strategy: z.enum(["CUSTOM_JSON", "FINANCE_DEFAULT", "CRM_DEFAULT"]).default("CUSTOM_JSON"),
  scope: z.enum(["REAL_ESTATE", "FINANCIAL"]).default("FINANCIAL"),
  baseUrl: z
    .string()
    .trim()
    .url("baseUrl must be a valid URL.")
    .refine((u) => /^https?:\/\//i.test(u), { message: "baseUrl must be http(s)" }),
  method: z.enum(["POST", "PUT", "PATCH"]).default("POST"),
  secret: z.string().trim().min(1).max(512).optional(),
  isActive: z.boolean().optional().default(true),
  timeoutMs: z.coerce.number().int().min(1000).max(60_000).default(10_000),
});

export type WebhookEndpointInput = z.infer<typeof webhookEndpointSchema>;

/** Same shape minus required fields — for PATCH updates. */
export const webhookEndpointPatchSchema = webhookEndpointSchema.partial();

export type WebhookEndpointPatchInput = z.infer<typeof webhookEndpointPatchSchema>;

/** Dynamic financial-routing rule management. */
export const routingRuleSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(160),
  priority: z.coerce.number().int().min(0).max(10000).default(100),
  isActive: z.boolean().optional().default(true),
  city: z.string().trim().max(120).optional().nullable(),
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "state must be a two-letter UF")
    .transform((v) => v.toUpperCase())
    .optional()
    .nullable(),
  minMonthlyIncome: z.coerce.number().nonnegative().max(1e12).optional().nullable(),
  maxMonthlyIncome: z.coerce.number().nonnegative().max(1e12).optional().nullable(),
  minPropertyValue: z.coerce.number().nonnegative().max(1e12).optional().nullable(),
  maxPropertyValue: z.coerce.number().nonnegative().max(1e12).optional().nullable(),
  minTermMonths: z.coerce.number().int().min(1).max(480).optional().nullable(),
  maxTermMonths: z.coerce.number().int().min(1).max(480).optional().nullable(),
  endpointId: z.string().min(1, "endpointId is required.").max(64),
});

export type RoutingRuleInput = z.infer<typeof routingRuleSchema>;
export const routingRulePatchSchema = routingRuleSchema.partial();
export type RoutingRulePatchInput = z.infer<typeof routingRulePatchSchema>;

export const tenantStatusSchema = z.object({
  status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "BLOCKED", "CANCELLED"]),
  reason: z.string().trim().max(1000).optional(),
});

export const queryPageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Loose zod schema used at the queue boundary for job payloads. */
export const queuedJobDataSchema = z.object({
  tenantId: z.string().min(1),
});