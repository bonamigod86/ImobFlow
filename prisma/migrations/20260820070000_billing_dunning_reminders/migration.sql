-- AlterEnum
-- Adds the DUE_REMINDER and LATE_REMINDER stages to the dunning notification
-- rule (checklist item 14: "comunicação no vencimento" + "lembretes em atraso").

ALTER TYPE "BillingNotificationKind" ADD VALUE 'DUE_REMINDER';
ALTER TYPE "BillingNotificationKind" ADD VALUE 'LATE_REMINDER';