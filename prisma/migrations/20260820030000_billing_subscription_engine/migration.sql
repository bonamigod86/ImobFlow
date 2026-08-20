-- Phase 5 — Billing, subscription engine, automated dunning & Master Admin panel
-- Additive only: new enums, Plan/Tenant columns, subscription/invoice/ledger models.

-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'ASAAS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BillingEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "PaymentInvoiceStatus" AS ENUM ('OPEN', 'OVERDUE', 'PAID', 'REFUNDED', 'VOID');

-- CreateEnum
CREATE TYPE "BillingNotificationKind" AS ENUM ('PRE_DUE', 'PAYMENT_FAILED', 'GRACE_EXPIRED', 'REACTIVATED');

-- CreateEnum
CREATE TYPE "HighlightPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "HighlightLedgerKind" AS ENUM ('PLAN_ALLOTMENT', 'TOPUP', 'ACTIVATION_DEBIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "HighlightSource" AS ENUM ('PLAN', 'PURCHASED');

-- AlterTable (Plan — dynamic plan configurator column set)
ALTER TABLE "Plan"
    ADD COLUMN "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    ADD COLUMN "maxProperties" INTEGER,
    ADD COLUMN "maxUsers" INTEGER,
    ADD COLUMN "maxLeads" INTEGER,
    ADD COLUMN "highlightCredits" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "gracePeriodDays" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 14;

-- AlterTable (Tenant — manual ops block + plan override)
ALTER TABLE "Tenant"
    ADD COLUMN "manualBlockedAt" TIMESTAMP(3),
    ADD COLUMN "blockReason" TEXT,
    ADD COLUMN "planOverridePlanId" TEXT,
    ADD COLUMN "planOverrideUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL DEFAULT 'STRIPE',
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "nextInvoiceDueAt" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "providerRaw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "providerInvoiceId" TEXT,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "status" "PaymentInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "kind" "BillingNotificationKind" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HighlightPurchase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creditsBought" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "totalPriceCents" INTEGER NOT NULL DEFAULT 0,
    "provider" "BillingProvider" NOT NULL DEFAULT 'CUSTOM',
    "providerPaymentId" TEXT,
    "status" "HighlightPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT,
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HighlightPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyHighlight" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "source" "HighlightSource" NOT NULL DEFAULT 'PLAN',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "priorityBoost" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HighlightCreditLedger" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "HighlightLedgerKind" NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "balanceBefore" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "purchaseId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HighlightCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "BillingEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "tenantId" TEXT,
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (Tenant)
CREATE INDEX "Tenant_manualBlockedAt_idx" ON "Tenant"("manualBlockedAt");

-- CreateIndex (TenantSubscription)
CREATE UNIQUE INDEX "TenantSubscription_tenantId_key" ON "TenantSubscription"("tenantId");
CREATE UNIQUE INDEX "TenantSubscription_providerCustomerId_key" ON "TenantSubscription"("providerCustomerId");
CREATE UNIQUE INDEX "TenantSubscription_providerSubscriptionId_key" ON "TenantSubscription"("providerSubscriptionId");
CREATE INDEX "TenantSubscription_status_idx" ON "TenantSubscription"("status");
CREATE INDEX "TenantSubscription_planId_idx" ON "TenantSubscription"("planId");
CREATE INDEX "TenantSubscription_graceEndsAt_idx" ON "TenantSubscription"("graceEndsAt");
CREATE INDEX "TenantSubscription_nextInvoiceDueAt_idx" ON "TenantSubscription"("nextInvoiceDueAt");

-- CreateIndex (PaymentInvoice)
CREATE UNIQUE INDEX "PaymentInvoice_providerInvoiceId_key" ON "PaymentInvoice"("providerInvoiceId");
CREATE INDEX "PaymentInvoice_tenantId_status_idx" ON "PaymentInvoice"("tenantId", "status");
CREATE INDEX "PaymentInvoice_tenantId_dueDate_idx" ON "PaymentInvoice"("tenantId", "dueDate");
CREATE INDEX "PaymentInvoice_tenantId_paidAt_idx" ON "PaymentInvoice"("tenantId", "paidAt");

-- CreateIndex (BillingNotification)
CREATE INDEX "BillingNotification_tenantId_kind_idx" ON "BillingNotification"("tenantId", "kind");
CREATE INDEX "BillingNotification_tenantId_createdAt_idx" ON "BillingNotification"("tenantId", "createdAt");
CREATE UNIQUE INDEX "BillingNotification_tenantId_kind_dueDate_key" ON "BillingNotification"("tenantId", "kind", "dueDate");

-- CreateIndex (HighlightPurchase)
CREATE UNIQUE INDEX "HighlightPurchase_providerPaymentId_key" ON "HighlightPurchase"("providerPaymentId");
CREATE INDEX "HighlightPurchase_tenantId_status_idx" ON "HighlightPurchase"("tenantId", "status");
CREATE INDEX "HighlightPurchase_tenantId_createdAt_idx" ON "HighlightPurchase"("tenantId", "createdAt");

-- CreateIndex (PropertyHighlight)
CREATE UNIQUE INDEX "PropertyHighlight_propertyId_key" ON "PropertyHighlight"("propertyId");
CREATE UNIQUE INDEX "PropertyHighlight_purchaseId_key" ON "PropertyHighlight"("purchaseId");
CREATE INDEX "PropertyHighlight_tenantId_endsAt_idx" ON "PropertyHighlight"("tenantId", "endsAt");
CREATE INDEX "PropertyHighlight_endsAt_idx" ON "PropertyHighlight"("endsAt");

-- CreateIndex (HighlightCreditLedger)
CREATE INDEX "HighlightCreditLedger_tenantId_createdAt_idx" ON "HighlightCreditLedger"("tenantId", "createdAt");
CREATE INDEX "HighlightCreditLedger_tenantId_kind_idx" ON "HighlightCreditLedger"("tenantId", "kind");

-- CreateIndex (BillingEvent)
CREATE INDEX "BillingEvent_status_idx" ON "BillingEvent"("status");
CREATE INDEX "BillingEvent_tenantId_receivedAt_idx" ON "BillingEvent"("tenantId", "receivedAt");
CREATE UNIQUE INDEX "BillingEvent_provider_providerEventId_key" ON "BillingEvent"("provider", "providerEventId");

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_planOverridePlanId_fkey" FOREIGN KEY ("planOverridePlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInvoice" ADD CONSTRAINT "PaymentInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInvoice" ADD CONSTRAINT "PaymentInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingNotification" ADD CONSTRAINT "BillingNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingNotification" ADD CONSTRAINT "BillingNotification_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TenantSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighlightPurchase" ADD CONSTRAINT "HighlightPurchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyHighlight" ADD CONSTRAINT "PropertyHighlight_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyHighlight" ADD CONSTRAINT "PropertyHighlight_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyHighlight" ADD CONSTRAINT "PropertyHighlight_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "HighlightPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighlightCreditLedger" ADD CONSTRAINT "HighlightCreditLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HighlightCreditLedger" ADD CONSTRAINT "HighlightCreditLedger_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "HighlightPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;