-- Phase 2 — Property Management Engine
-- Replaces the coarse Phase 1 `PropertyStatus` with a listing-workflow model.

-- CreateEnum
CREATE TYPE "PropertyTarget" AS ENUM ('SALE', 'RENT', 'BOTH');

-- CreateEnum
CREATE TYPE "PropertyCategory" AS ENUM ('APARTMENT', 'HOUSE', 'COMMERCIAL', 'LAND', 'FARM', 'OFFICE', 'GARAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportFileKind" AS ENUM ('XML', 'CSV', 'JSON');

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('VIVA_REAL', 'ZAP', 'CSV', 'REST_API', 'MANUAL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED');

-- AlterEnum — migrate `Property.status` from the Phase 1 vocabulary
-- (AVAILABLE/PENDING/RENTED/SOLD/OFF_MARKET) to the Phase 2 one
-- (ACTIVE/INACTIVE/SOLD/RENTED) by shifting through a temporary enum type.
ALTER TABLE "Property" ALTER COLUMN "status" DROP DEFAULT;

-- CreateEnum (temporary, holds the new vocabulary)
CREATE TYPE "PropertyStatusNew" AS ENUM ('ACTIVE', 'INACTIVE', 'SOLD', 'RENTED');

ALTER TABLE "Property" ALTER COLUMN "status" TYPE "PropertyStatusNew"
    USING (
        CASE "status"::text
            WHEN 'AVAILABLE'  THEN 'ACTIVE'::"PropertyStatusNew"
            WHEN 'PENDING'    THEN 'INACTIVE'::"PropertyStatusNew"
            WHEN 'OFF_MARKET' THEN 'INACTIVE'::"PropertyStatusNew"
            WHEN 'SOLD'       THEN 'SOLD'::"PropertyStatusNew"
            WHEN 'RENTED'     THEN 'RENTED'::"PropertyStatusNew"
            ELSE 'ACTIVE'::"PropertyStatusNew"
        END
    );

ALTER TABLE "Property" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"PropertyStatusNew";

DROP TYPE "PropertyStatus";

ALTER TYPE "PropertyStatusNew" RENAME TO "PropertyStatus";

-- AlterTable — Phase 2 Property columns: drop the single `price`, add the
-- full listing/pricing/location/spec/flag surface used by the engine.
ALTER TABLE "Property" DROP COLUMN "price";

ALTER TABLE "Property" ADD COLUMN "externalCode" TEXT,
    ADD COLUMN "description" TEXT,
    ADD COLUMN "target" "PropertyTarget" NOT NULL DEFAULT 'SALE',
    ADD COLUMN "category" "PropertyCategory" NOT NULL DEFAULT 'APARTMENT',
    ADD COLUMN "salePrice" DECIMAL(12,2),
    ADD COLUMN "rentPrice" DECIMAL(12,2),
    ADD COLUMN "condoFee" DECIMAL(12,2),
    ADD COLUMN "propertyTax" DECIMAL(12,2),
    ADD COLUMN "number" TEXT,
    ADD COLUMN "zipCode" TEXT,
    ADD COLUMN "latitude" DECIMAL(10,7),
    ADD COLUMN "longitude" DECIMAL(10,7),
    ADD COLUMN "area" DECIMAL(10,2),
    ADD COLUMN "bedrooms" INTEGER,
    ADD COLUMN "suites" INTEGER,
    ADD COLUMN "bathrooms" INTEGER,
    ADD COLUMN "parkingSpots" INTEGER,
    ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "isFurnished" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable — Lead gains optional attribution to the originating Property.
ALTER TABLE "Lead" ADD COLUMN "propertyId" TEXT;

-- CreateTable
CREATE TABLE "PropertyMedia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'IMAGE',
    "objectKey" TEXT,
    "variants" JSONB,
    "url" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "height" INTEGER,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyView" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "viewer" TEXT,
    "channel" TEXT,
    "pageUrl" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyPattern" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "peakHour" INTEGER,
    "peakDay" INTEGER,
    "views7d" INTEGER NOT NULL DEFAULT 0,
    "views30d" INTEGER NOT NULL DEFAULT 0,
    "leads7d" INTEGER NOT NULL DEFAULT 0,
    "leads30d" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orgId" TEXT,
    "source" "ImportSource" NOT NULL DEFAULT 'MANUAL',
    "fileKind" "ImportFileKind" NOT NULL DEFAULT 'CSV',
    "fileName" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'QUEUED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Property_tenantId_externalCode_key" ON "Property"("tenantId", "externalCode");

-- CreateIndex
CREATE INDEX "Property_tenantId_isActive_idx" ON "Property"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Property_tenantId_category_idx" ON "Property"("tenantId", "category");

-- CreateIndex
CREATE INDEX "PropertyMedia_tenantId_id_idx" ON "PropertyMedia"("tenantId", "id");

-- CreateIndex
CREATE INDEX "PropertyMedia_propertyId_isPrimary_idx" ON "PropertyMedia"("propertyId", "isPrimary");

-- CreateIndex
CREATE INDEX "PropertyMedia_tenantId_status_idx" ON "PropertyMedia"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyMedia_propertyId_objectKey_key" ON "PropertyMedia"("propertyId", "objectKey");

-- CreateIndex
CREATE INDEX "PropertyView_propertyId_createdAt_idx" ON "PropertyView"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "PropertyView_tenantId_createdAt_idx" ON "PropertyView"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyPattern_propertyId_key" ON "PropertyPattern"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyPattern_tenantId_views30d_idx" ON "PropertyPattern"("tenantId", "views30d");

-- CreateIndex
CREATE INDEX "Lead_propertyId_idx" ON "Lead"("propertyId");

-- CreateIndex
CREATE INDEX "ImportBatch_tenantId_status_idx" ON "ImportBatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ImportBatch_tenantId_createdAt_idx" ON "ImportBatch"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "PropertyMedia" ADD CONSTRAINT "PropertyMedia_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyMedia" ADD CONSTRAINT "PropertyMedia_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyView" ADD CONSTRAINT "PropertyView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyView" ADD CONSTRAINT "PropertyView_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyPattern" ADD CONSTRAINT "PropertyPattern_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyPattern" ADD CONSTRAINT "PropertyPattern_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;