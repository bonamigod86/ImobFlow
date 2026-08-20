-- Phase 4 – Lead Engine, Routing Layer & Decoupled External Integrations
-- Adds: LGPD consent records, structured financial-lead profiles, outbound
-- webhook endpoints (HMAC-signed), dynamic routing rules, and the durable
-- delivery + per-attempt execution log used for zero-loss, idempotent dispatch.
--
-- Downgrade note: deleting the added columns/tables is enough to roll back;
-- the enum values can stay (unused enum members are harmless).

-- Join/selection of new enum types used by the delivery pipeline.
CREATE TYPE "WebhookEndpointScope" AS ENUM ('REAL_ESTATE', 'FINANCIAL');

CREATE TYPE "WebhookStrategy" AS ENUM ('CUSTOM_JSON', 'FINANCE_DEFAULT', 'CRM_DEFAULT');

CREATE TYPE "WebhookDeliveryStatus" AS ENUM (
    'PENDING',
    'IN_FLIGHT',
    'DELIVERED',
    'FAILED',
    'DEAD_LETTERED'
);

-- Extend the existing lead-type enum (Postgres >= 12 supports ADD VALUE
-- inside a transactional migration).
ALTER TYPE "LeadType" ADD VALUE IF NOT EXISTS 'FINANCIAL';

-- Lead: assignment to the receiving agent / tenant owner.
ALTER TABLE "Lead" ADD COLUMN "assignedToId" TEXT;

-- CreateTable ────────────────────────────────────────────────────────────────
CREATE TABLE "LeadConsent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "textVersion" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,
    "originUrl" TEXT,
    "userAgent" TEXT,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),

    CONSTRAINT "LeadConsent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialLeadProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "propertyValue" DECIMAL(14,2),
    "downPayment" DECIMAL(14,2),
    "financingAmount" DECIMAL(14,2),
    "monthlyIncome" DECIMAL(14,2),
    "monthlyInstallmentLimit" DECIMAL(14,2),
    "termMonths" INTEGER,
    "city" TEXT,
    "state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialLeadProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "strategy" "WebhookStrategy" NOT NULL DEFAULT 'CUSTOM_JSON',
    "scope" "WebhookEndpointScope" NOT NULL DEFAULT 'FINANCIAL',
    "baseUrl" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "hmacSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoutingRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "city" TEXT,
    "state" TEXT,
    "minMonthlyIncome" DECIMAL(14,2),
    "maxMonthlyIncome" DECIMAL(14,2),
    "minPropertyValue" DECIMAL(14,2),
    "maxPropertyValue" DECIMAL(14,2),
    "minTermMonths" INTEGER,
    "maxTermMonths" INTEGER,
    "endpointId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookDeliveryAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "requestPayload" JSONB,
    "signature" TEXT,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "executionTimeMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- Foreign keys ───────────────────────────────────────────────────────────────
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadConsent" ADD CONSTRAINT "LeadConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadConsent" ADD CONSTRAINT "LeadConsent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialLeadProfile" ADD CONSTRAINT "FinancialLeadProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinancialLeadProfile" ADD CONSTRAINT "FinancialLeadProfile_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoutingRule" ADD CONSTRAINT "RoutingRule_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX "Lead_assignedToId_idx" ON "Lead"("assignedToId");

CREATE UNIQUE INDEX "LeadConsent_leadId_key" ON "LeadConsent"("leadId");
CREATE INDEX "LeadConsent_tenantId_id_idx" ON "LeadConsent"("tenantId", "id");
CREATE INDEX "LeadConsent_tenantId_grantedAt_idx" ON "LeadConsent"("tenantId", "grantedAt");

CREATE UNIQUE INDEX "FinancialLeadProfile_leadId_key" ON "FinancialLeadProfile"("leadId");
CREATE INDEX "FinancialLeadProfile_tenantId_id_idx" ON "FinancialLeadProfile"("tenantId", "id");
CREATE INDEX "FinancialLeadProfile_tenantId_monthlyIncome_idx" ON "FinancialLeadProfile"("tenantId", "monthlyIncome");
CREATE INDEX "FinancialLeadProfile_tenantId_propertyValue_idx" ON "FinancialLeadProfile"("tenantId", "propertyValue");

CREATE INDEX "WebhookEndpoint_tenantId_isActive_idx" ON "WebhookEndpoint"("tenantId", "isActive");
CREATE INDEX "WebhookEndpoint_scope_isActive_idx" ON "WebhookEndpoint"("scope", "isActive");

CREATE INDEX "RoutingRule_tenantId_isActive_idx" ON "RoutingRule"("tenantId", "isActive");
CREATE INDEX "RoutingRule_endpointId_idx" ON "RoutingRule"("endpointId");

CREATE UNIQUE INDEX "WebhookDelivery_idempotencyKey_key" ON "WebhookDelivery"("idempotencyKey");
CREATE UNIQUE INDEX "WebhookDelivery_leadId_endpointId_key" ON "WebhookDelivery"("leadId", "endpointId");
CREATE INDEX "WebhookDelivery_tenantId_status_idx" ON "WebhookDelivery"("tenantId", "status");
CREATE INDEX "WebhookDelivery_tenantId_createdAt_idx" ON "WebhookDelivery"("tenantId", "createdAt");
CREATE INDEX "WebhookDelivery_endpointId_idx" ON "WebhookDelivery"("endpointId");
CREATE INDEX "WebhookDelivery_deliveredAt_idx" ON "WebhookDelivery"("deliveredAt");

CREATE INDEX "WebhookDeliveryAttempt_deliveryId_attemptNumber_idx" ON "WebhookDeliveryAttempt"("deliveryId", "attemptNumber");
CREATE INDEX "WebhookDeliveryAttempt_tenantId_createdAt_idx" ON "WebhookDeliveryAttempt"("tenantId", "createdAt");