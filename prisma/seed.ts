import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildSearchText, ensureUniqueSlug, slugBaseFrom } from "../src/lib/properties/seo";
import { encryptSecret } from "../src/lib/crypto/secrets";

/**
 * Idempotent development seed.
 *   npm run db:seed
 *
 * Creates: platform plans, three demo tenants (acme, norton, delta) with
 * role-balanced users, sample properties & leads. Safe to run repeatedly
 * (upserts by stable slugs/codes/e-mails; leads use existence-checked creates).
 *
 * Phase 3: listings get public identities (`.slug`, `searchText`) backed by
 * the shared SEO helpers so public PDP URLs are globally unique.
 *
 * Phase 5: plans carry billing config and tenants are plugged into the real
 * webhook pipeline (provision -> simulated gateway events) so the Master Admin
 * console shows live MRR, invoices, dunning notifications and a highlight
 * add-on economy from seed data.
 */

const prisma = new PrismaClient();

const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe-123!";

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  // --- Platform plans (Phase 5 billing config) ------------------------------
  const free = await prisma.plan.upsert({
    where: { code: "free" },
    update: {
      name: "Free",
      priceCents: 0,
      billingCycle: "MONTHLY",
      maxProperties: 10,
      maxUsers: 5,
      maxLeads: 100,
      highlightCredits: 0,
      gracePeriodDays: 5,
      trialDays: 14,
      features: { maxProperties: 10, maxUsers: 5, maxLeads: 100 },
    },
    create: {
      code: "free",
      name: "Free",
      priceCents: 0,
      billingCycle: "MONTHLY",
      maxProperties: 10,
      maxUsers: 5,
      maxLeads: 100,
      highlightCredits: 0,
      gracePeriodDays: 5,
      trialDays: 14,
      features: { maxProperties: 10, maxUsers: 5, maxLeads: 100 },
    },
  });
  const pro = await prisma.plan.upsert({
    where: { code: "pro" },
    update: {
      name: "Professional",
      priceCents: 49900,
      billingCycle: "MONTHLY",
      maxProperties: 500,
      maxUsers: 10,
      maxLeads: 5000,
      highlightCredits: 30,
      gracePeriodDays: 7,
      trialDays: 14,
      features: {
        maxProperties: 500,
        maxUsers: 10,
        maxLeads: 5000,
        allowedOrigins: ["SITE_FORM", "PORTAL"],
      },
    },
    create: {
      code: "pro",
      name: "Professional",
      priceCents: 49900,
      billingCycle: "MONTHLY",
      maxProperties: 500,
      maxUsers: 10,
      maxLeads: 5000,
      highlightCredits: 30,
      gracePeriodDays: 7,
      trialDays: 14,
      features: {
        maxProperties: 500,
        maxUsers: 10,
        maxLeads: 5000,
        allowedOrigins: ["SITE_FORM", "PORTAL"],
      },
    },
  });
  const enterprise = await prisma.plan.upsert({
    where: { code: "enterprise" },
    update: {
      name: "Enterprise",
      priceCents: 99900,
      billingCycle: "MONTHLY",
      maxProperties: 100000,
      maxUsers: 50,
      maxLeads: 1000000,
      highlightCredits: 90,
      gracePeriodDays: 10,
      trialDays: 14,
      features: { maxProperties: 100000, maxUsers: 50, maxLeads: 1000000, webhooks: true },
    },
    create: {
      code: "enterprise",
      name: "Enterprise",
      priceCents: 99900,
      billingCycle: "MONTHLY",
      maxProperties: 100000,
      maxUsers: 50,
      maxLeads: 1000000,
      highlightCredits: 90,
      gracePeriodDays: 10,
      trialDays: 14,
      features: { maxProperties: 100000, maxUsers: 50, maxLeads: 1000000, webhooks: true },
    },
  });

  // --- Platform admin (MASTER, no tenant) ----------------------------------
  await prisma.user.upsert({
    where: { email: "admin@saas.local" },
    update: { passwordHash },
    create: {
      email: "admin@saas.local",
      name: "Platform Admin",
      passwordHash,
      role: "MASTER",
      tenantId: null,
    },
  });
  console.log("MASTER:", "admin@saas.local", "/", SEED_PASSWORD);

  // --- Demo tenants ---------------------------------------------------------
const acme = await seedTenant(
  "acme",
  "ACME Imóveis",
  pro,
  "ACTIVE",
  passwordHash,
  {
    type: "AGENCY",
    legalName: "ACME Imóveis Ltda",
    document: "11222333000181",
    creci: "CRECI-SP 12345-F",
    responsibleName: "Carlos Acmé",
    phone: "+55 11 97777-1111",
    whatsapp: "+55 11 97777-1111",
    contactEmail: "contato@acmeimoveis.com.br",
    address: "Av. Paulista, 1000, cj 151",
    city: "São Paulo",
    state: "SP",
    description: "Imobiliária boutique no centro de São Paulo há 15 anos.",
    website: "https://acmeimoveis.com.br",
    socialLinks: { instagram: "https://instagram.com/acmeimoveis", linkedin: "https://linkedin.com/company/acme" },
  },
);
const norton = await seedTenant("norton", "Norton Brokers", free, "TRIAL", passwordHash, { type: "BROKER" });
const delta = await seedTenant("delta", "Delta Intermediações", enterprise, "PAST_DUE", passwordHash, { type: "AGENCY" });

  // --- Phase 4: lead engine destinations + routing (platform-owned) ---------
  const cred = await prisma.webhookEndpoint.upsert({
    where: { id: "seed-end-cred" },
    update: { isActive: true },
    create: {
      id: "seed-end-cred",
      tenantId: null,
      name: "CredFácil Fintech (parceiro)",
      strategy: "FINANCE_DEFAULT",
      scope: "FINANCIAL",
      baseUrl: "https://webhook.cred.example.com/api/lead-acquisition",
      method: "POST",
      hmacSecret: encryptSecret("seed-shared-hmac-secret"),
      isActive: true,
      timeoutMs: 10_000,
    },
  });
  const crm = await prisma.webhookEndpoint.upsert({
    where: { id: "seed-end-crm" },
    update: { isActive: true },
    create: {
      id: "seed-end-crm",
      tenantId: null,
      name: "CRM Vivo Sales (central)",
      strategy: "CRM_DEFAULT",
      scope: "REAL_ESTATE",
      baseUrl: "https://webhook.crm.example.com/v1/leads",
      method: "POST",
      hmacSecret: encryptSecret("seed-shared-hmac-secret"),
      isActive: true,
      timeoutMs: 10_000,
    },
  });

  await prisma.routingRule.upsert({
    where: { id: "seed-rule-sp" },
    update: {},
    create: {
      id: "seed-rule-sp",
      tenantId: null,
      name: "SP — financiamento até R$1,5M",
      priority: 10,
      state: "SP",
      minPropertyValue: 100_000,
      maxPropertyValue: 1_500_000,
      minMonthlyIncome: 5_000,
      maxMonthlyIncome: 60_000,
      endpointId: cred.id,
      isActive: true,
    },
  });
  await prisma.routingRule.upsert({
    where: { id: "seed-rule-fallback" },
    update: {},
    create: {
      id: "seed-rule-fallback",
      tenantId: null,
      name: "Demais localidades",
      priority: 100,
      endpointId: cred.id,
      isActive: true,
    },
  });

  const tenants = await prisma.tenant.findMany();
  console.log(`Seeded ${tenants.length} tenants + 2 webhook endpoints + 2 routing rules (plans: free/pro/enterprise).`);

  // --- Phase 5: billing — provision + simulate the real webhook pipeline ----
  await seedBilling(acme, pro, "ACTIVE");
  await seedBilling(norton, free, "TRIAL");
  await seedBilling(delta, enterprise, "PAST_DUE");
  console.log("Phase 5 billing seeded (subscriptions, webhook ledger, dunning + highlight economy).");
}

async function seedTenant(
  slug: string,
  name: string,
  plan: { id: string },
  status: "ACTIVE" | "TRIAL" | "PAST_DUE" | "BLOCKED",
  passwordHash: string,
  profile?: {
    type?: "AGENCY" | "BROKER";
    legalName?: string;
    document?: string;
    creci?: string;
    responsibleName?: string;
    phone?: string;
    whatsapp?: string;
    contactEmail?: string;
    address?: string;
    city?: string;
    state?: string;
    description?: string;
    website?: string;
    socialLinks?: Record<string, string>;
  },
): Promise<{ id: string; slug: string; name: string }> {
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {
      name,
      planId: plan.id,
      status,
      type: profile?.type ?? "AGENCY",
      legalName: profile?.legalName,
      document: profile?.document,
      creci: profile?.creci,
      responsibleName: profile?.responsibleName,
      phone: profile?.phone,
      whatsapp: profile?.whatsapp,
      contactEmail: profile?.contactEmail,
      address: profile?.address,
      city: profile?.city,
      state: profile?.state,
      description: profile?.description,
      website: profile?.website,
      socialLinks: profile?.socialLinks,
    },
    create: {
      slug,
      name,
      planId: plan.id,
      status,
      type: profile?.type ?? "AGENCY",
      legalName: profile?.legalName,
      document: profile?.document,
      creci: profile?.creci,
      responsibleName: profile?.responsibleName,
      phone: profile?.phone,
      whatsapp: profile?.whatsapp,
      contactEmail: profile?.contactEmail,
      address: profile?.address,
      city: profile?.city,
      state: profile?.state,
      description: profile?.description,
      website: profile?.website,
      socialLinks: profile?.socialLinks,
    },
  });

  const users: Array<[string, string, "OWNER" | "MANAGER" | "AGENT" | "RECEPTIONIST", string | null]> = [
    [`${slug}@${slug}.com`, `${slug} Owner`, "OWNER", "+55 11 90000-0000"],
    [`manager@${slug}.com`, `${slug} Manager`, "MANAGER", null],
    [`agent@${slug}.com`, `${slug} Agent`, "AGENT", null],
    [`reception@${slug}.com`, `${slug} Receptionist`, "RECEPTIONIST", null],
  ];

  for (const [email, display, role, phone] of users) {
    await prisma.user.upsert({
      where: { email },
      update: { name: display, role, phone },
      create: { tenantId: tenant.id, email, name: display, passwordHash, role, phone },
    });
  }

  // Sample properties — unique per (tenantId, code). Every listing gets a
  // globally unique public slug + denormalized searchText (SEO/search engine).
  const properties: Array<{
    code: string;
    title: string;
    target: "SALE" | "RENT" | "BOTH";
    category: "APARTMENT" | "HOUSE" | "COMMERCIAL" | "LAND" | "OFFICE";
    status: "ACTIVE" | "INACTIVE" | "SOLD" | "RENTED";
    salePrice?: number;
    rentPrice?: number;
    condoFee?: number;
    address?: string;
    city: string;
    state: string;
    neighborhood?: string;
    bedrooms?: number;
    suites?: number;
    bathrooms?: number;
    parkingSpots?: number;
    area?: number;
    isFeatured?: boolean;
    isFurnished?: boolean;
    description?: string;
  }> = [
    {
      code: "ACA-001",
      title: "Apartamento Copacabana",
      target: "SALE",
      category: "APARTMENT",
      status: "ACTIVE",
      salePrice: 750000,
      condoFee: 850,
      address: "Av. Atlântica 1000",
      city: "Rio de Janeiro",
      state: "RJ",
      neighborhood: "Copacabana",
      bedrooms: 2,
      suites: 1,
      bathrooms: 2,
      parkingSpots: 1,
      area: 68,
      isFeatured: true,
      description: "Apartamento com vista parcial para o mar em Copacabana, próximo ao metrô e orla.",
    },
    {
      code: "ACA-002",
      title: "Casa Jardins",
      target: "BOTH",
      category: "HOUSE",
      status: "ACTIVE",
      salePrice: 1200000,
      rentPrice: 6500,
      city: "São Paulo",
      state: "SP",
      neighborhood: "Jardins",
      bedrooms: 3,
      suites: 2,
      bathrooms: 3,
      parkingSpots: 2,
      area: 145,
      isFeatured: true,
      description: "Casa de alto padrão nos Jardins, com área de lazer e jardim privativo.",
    },
    {
      code: "ACA-003",
      title: "Cobertura Itaim Bibi",
      target: "SALE",
      category: "APARTMENT",
      status: "ACTIVE",
      salePrice: 2450000,
      condoFee: 3400,
      city: "São Paulo",
      state: "SP",
      neighborhood: "Itaim Bibi",
      bedrooms: 4,
      suites: 3,
      bathrooms: 5,
      parkingSpots: 4,
      area: 220,
      isFeatured: true,
      description: "Cobertura duplex com terraço gourmet, piscina privativa e vista para o skyline.",
    },
    {
      code: "ACA-004",
      title: "Sala Comercial Barra Funda",
      target: "RENT",
      category: "OFFICE",
      status: "ACTIVE",
      rentPrice: 4800,
      condoFee: 1200,
      city: "São Paulo",
      state: "SP",
      neighborhood: "Barra Funda",
      bathrooms: 1,
      parkingSpots: 2,
      area: 85,
      isFurnished: true,
      description: "Sala comercial em prédio corporativo com recepção, ar-condicionado e vagas.",
    },
    {
      code: "NRT-101",
      title: "Casa Condomínio Alphaville",
      target: "SALE",
      category: "HOUSE",
      status: "ACTIVE",
      salePrice: 1850000,
      condoFee: 1500,
      city: "Barueri",
      state: "SP",
      neighborhood: "Alphaville",
      bedrooms: 5,
      suites: 4,
      bathrooms: 6,
      parkingSpots: 4,
      area: 340,
      isFeatured: true,
      description: "Casa em condomínio fechado com segurança 24h, piscina, churrasqueira e home office.",
    },
    {
      code: "NRT-102",
      title: "Apartamento Moema",
      target: "RENT",
      category: "APARTMENT",
      status: "ACTIVE",
      rentPrice: 4200,
      condoFee: 980,
      city: "São Paulo",
      state: "SP",
      neighborhood: "Moema",
      bedrooms: 3,
      suites: 2,
      bathrooms: 2,
      parkingSpots: 2,
      area: 96,
      isFurnished: false,
      description: "Apartamento em Moema com varanda, portaria 24h e lazer completo.",
    },
  ];

  for (const spec of properties) {
    const slug = await ensureUniqueSlug(slugBaseFrom(spec));
    await prisma.property.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: spec.code } },
      update: {
        slug,
        searchText: buildSearchText(spec),
        status: spec.status,
        salePrice: spec.salePrice ?? null,
        rentPrice: spec.rentPrice ?? null,
      },
      create: {
        tenantId: tenant.id,
        ...spec,
        slug,
        searchText: buildSearchText(spec),
        isActive: spec.status === "ACTIVE",
      },
    });
  }

  // Sample leads — Lead has no natural unique key; existence-checked create.
  // Every lead carries its LGPD consent record (Phase 4).
  const leads: Array<{ name: string; email: string; type: "BUYER" | "RENTER" }> = [
    { name: "Marcos Silva", email: `lead.buyer@${slug}.com`, type: "BUYER" },
    { name: "Ana Souza", email: `lead.renter@${slug}.com`, type: "RENTER" },
  ];
  for (const leadSpec of leads) {
    let lead = await prisma.lead.findFirst({
      where: { tenantId: tenant.id, email: leadSpec.email },
    });
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          tenantId: tenant.id,
          name: leadSpec.name,
          email: leadSpec.email,
          phone: "+55 11 90000-0000",
          type: leadSpec.type,
          origin: "SITE_FORM",
          status: "NEW",
          payload: { utm: { source: "seed" } },
          consent: { create: consentRecord(tenant.id) },
        },
      });
    } else {
      await ensureConsent(tenant.id, lead.id);
    }
  }

  // Phase 4 — demo financial lead with structured profile + consent.
  const financialEmail = `finance.lead@${slug}.com`;
  let financialLead = await prisma.lead.findFirst({
    where: { tenantId: tenant.id, email: financialEmail },
  });
  if (!financialLead) {
    financialLead = await prisma.lead.create({
      data: {
        tenantId: tenant.id,
        name: "Camila Rocha",
        email: financialEmail,
        phone: "+55 11 98888-7777",
        type: "FINANCIAL",
        origin: "SITE_FORM",
        status: "NEW",
        payload: { utm: { source: "seed" }, source: "portal-financing" },
        consent: { create: consentRecord(tenant.id) },
        financeProfile: {
          create: {
            tenantId: tenant.id,
            propertyValue: 720_000,
            downPayment: 144_000,
            financingAmount: 576_000,
            monthlyIncome: 18_000,
            monthlyInstallmentLimit: 5_500,
            termMonths: 360,
            city: "São Paulo",
            state: "SP",
          },
        },
      },
    });
  } else {
    await ensureConsent(tenant.id, financialLead.id);
  }

  console.log(
    `Tenant "${slug}" seeded (${users.length} users, ${properties.length} properties, ${leads.length + 1} leads).`,
  );

  return { id: tenant.id, slug: tenant.slug, name: tenant.name };
}

/** LGPD consent record used by seeded captures (report-grade demo). */
function consentRecord(tenantId: string) {
  return {
    tenantId,
    textVersion: "2026-08-19.v1",
    consentText:
      "Autorizo o armazenamento e o tratamento dos dados informados para viabilizar o contato comercial sobre o imóvel solicitado, em conformidade com a LGPD (Lei 13.709/2018).",
    ipAddress: "127.0.0.1",
    originUrl: "https://imob.example.com/seed",
    userAgent: "seed/db",
  };
}

async function ensureConsent(tenantId: string, leadId: string): Promise<void> {
  const existing = await prisma.leadConsent.findUnique({ where: { leadId } });
  if (!existing) {
    await prisma.leadConsent.create({
      data: { ...consentRecord(tenantId), leadId },
    });
  }
}

/**
 * Phase 5 — plug a tenant into the billing pipeline for the demo:
 *  - provision a subscription on its plan (idempotent);
 *  - push simulated gateway events through the REAL webhook chain
 *    (CUSTOM adapter: signature -> normalize -> idempotency ledger ->
 *    state machine);
 *  - seed a highlight economy for the ACTIVE demo tenant (activate a window +
 *    purchase top-up) so the Master console and the tenant billing page have
 *    live numbers.
 */
async function seedBilling(
  tenant: { id: string; slug: string },
  plan: { code: string },
  desired: "ACTIVE" | "TRIAL" | "PAST_DUE",
): Promise<void> {
  const { provisionSubscription, simulateProviderEvent } = await import("../src/lib/billing/service");
  const { activateHighlight } = await import("../src/lib/billing/highlights");

  await provisionSubscription({
    tenantId: tenant.id,
    planCode: plan.code,
    provider: "CUSTOM",
    force: true,
  });

  if (desired === "ACTIVE") {
    const DAY = 24 * 60 * 60 * 1000;
    await simulateProviderEvent({
      tenantId: tenant.id,
      type: "invoice.paid",
      overrides: {
        invoiceId: `inv_seed_${tenant.slug}`,
        amountCents: 49900,
        dueDate: new Date(Date.now() - 6 * DAY).toISOString(),
        paidAt: new Date(Date.now() - 5 * DAY).toISOString(),
        periodStart: new Date(Date.now() - 5 * DAY).toISOString(),
        periodEnd: new Date(Date.now() + 25 * DAY).toISOString(),
      },
    });

    // Highlight economy — activate a seeded window on the first property and
    // buy+confirm a top-up pack so MRR + add-on revenue show on the console.
    const property = await prisma.property.findFirst({
      where: { tenantId: tenant.id, code: "ACA-001" },
      select: { id: true },
    });
    if (property) {
      await activateHighlight({
        tenantId: tenant.id,
        propertyId: property.id,
        days: 15,
        priorityBoost: 2,
        source: "PLAN",
      });
    }
    const purchase = await prisma.highlightPurchase.create({
      data: {
        tenantId: tenant.id,
        creditsBought: 20,
        unitPriceCents: 50,
        totalPriceCents: 1000,
        provider: "CUSTOM",
        status: "PENDING",
      },
    });
    await simulateProviderEvent({
      tenantId: tenant.id,
      type: "checkout.completed",
      overrides: {
        invoiceId: `inv_seed_${tenant.slug}_topup`,
        metadata: { kind: "highlight_credits", purchaseId: purchase.id },
      },
    });
  }

  if (desired === "PAST_DUE") {
    await simulateProviderEvent({
      tenantId: tenant.id,
      type: "invoice.payment_failed",
      overrides: {
        invoiceId: `inv_seed_${tenant.slug}_overdue`,
        amountCents: 99900,
        dueDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });
    // Simulate the passage of time: grace already elapsed so the next dunning
    // scan auto-suspends this tenant (unless the master switch is off).
    await prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: { graceEndsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());