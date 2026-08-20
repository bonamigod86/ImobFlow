-- AlterEnum
-- Adds the PENDING_DUE lifecycle state (subscription created awaiting its
-- first payment — "Pendente" in the checklist state machine).

ALTER TYPE "TenantStatus" ADD VALUE 'PENDING_DUE';