-- Cadastro de imobiliárias e corretores (item 3): TenantType enum + profile fields.
CREATE TYPE "TenantType" AS ENUM ('AGENCY', 'BROKER');

ALTER TABLE "Tenant"
  ADD COLUMN "type" "TenantType" NOT NULL DEFAULT 'AGENCY',
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "document" TEXT,
  ADD COLUMN "creci" TEXT,
  ADD COLUMN "responsibleName" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "address" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "logoUrl" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "website" TEXT,
  ADD COLUMN "socialLinks" JSONB;

CREATE INDEX "Tenant_type_idx" ON "Tenant"("type");

ALTER TABLE "User"
  ADD COLUMN "document" TEXT,
  ADD COLUMN "creci" TEXT,
  ADD COLUMN "photoUrl" TEXT,
  ADD COLUMN "whatsapp" TEXT;