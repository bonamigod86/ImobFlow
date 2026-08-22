-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- Backfill: existing tenants are considered approved (only NEW registrations are pending).
UPDATE "Tenant" SET "approvedAt" = now() WHERE "approvedAt" IS NULL;