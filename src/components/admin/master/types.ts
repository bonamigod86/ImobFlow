import type { TenantStatus } from "@prisma/client";
import type { PlatformInsights } from "@/lib/admin/insights";

export type { TenantStatus };
export type { PlatformInsights };

export interface FinanceMetrics {
  mrrCents: number;
  periodRevenueCents: number;
  pendingRevenueCents: number;
  pastDueCount: number;
  pastDueAmountCents: number;
  blockedCount: number;
  churnedSubscriptions: number;
  churnRate: number;
  revenueByPlan: Array<{ planCode: string; planName: string; mrrCents: number; activeSubscriptions: number }>;
  subscriptionsByStatus: Array<{ status: TenantStatus; count: number }>;
}

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  planCode: string | null;
  planName: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  subscribedAt: string | null;
  nextInvoiceDueAt: string | null;
  pendingCents: number;
  manualBlockedAt: string | null;
}

export interface DunningRow {
  id: string;
  name: string;
  slug: string;
  planName: string | null;
  daysOverdue: number;
  pendingCents: number;
  graceEndsAt: string | null;
}

export interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  tenantSlug: string | null;
  createdAt: string;
}

export interface ControlData {
  generatedAt: string;
  kpi: {
    mrrCents: number;
    mrrTrendPct: number | null;
    activeTenants: number;
    paidTenants: number;
    pastDueTenants: number;
    leadsThisMonth: number;
    subscriptionsByStatus: Array<{ status: TenantStatus; count: number }>;
  };
  health: {
    db: "up" | "down";
    redis: "up" | "down";
    emailProvider: string;
    email: "up" | "diagnostic" | "down";
  };
  queues: {
    available: boolean;
    email: { name: string; counts: QueueCounts };
    totalActive: number;
    totalFailed: number;
    dlqFailed: number;
  };
  tenants: TenantRow[];
  dunning: DunningRow[];
  audit: AuditRow[];
  insights: PlatformInsights;
  finance: FinanceMetrics;
}

export interface PlanOption {
  code: string;
  name: string;
  priceCents: number;
  billingCycle: "MONTHLY" | "YEARLY";
  isActive: boolean;
}

export const STATUS_LABELS: Record<TenantStatus, string> = {
  TRIAL: "Trial",
  ACTIVE: "Ativo",
  PENDING_DUE: "Pendente",
  PAST_DUE: "Em atraso",
  BLOCKED: "Bloqueado",
  CANCELLED: "Cancelado",
};

export const STATUS_BADGE: Record<TenantStatus, "success" | "warning" | "danger" | "secondary" | "neutral"> = {
  TRIAL: "neutral",
  ACTIVE: "success",
  PENDING_DUE: "warning",
  PAST_DUE: "warning",
  BLOCKED: "danger",
  CANCELLED: "secondary",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  TENANT_CREATED: "Novo tenant",
  TENANT_STATUS_CHANGED: "Status alterado",
  TENANT_MANUALLY_BLOCKED: "Bloqueio manual",
  TENANT_MANUALLY_UNBLOCKED: "Desbloqueio manual",
  TENANT_PLAN_OVERRIDE_SET: "Plano sobreposto",
  TENANT_PLAN_OVERRIDE_CLEARED: "Override removido",
  TENANT_IMPERSONATED: "Acesso como assinante",
  TENANT_PAYMENT_LINK_SENT: "Link de pagamento",
  PLAN_CREATED: "Plano criado",
  PLAN_UPDATED: "Plano atualizado",
  SUBSCRIPTION_PROVISIONED: "Assinatura provisionada",
  SUBSCRIPTION_PAST_DUE: "Assinatura em atraso",
  SUBSCRIPTION_BLOCKED: "Assinatura bloqueada",
  SUBSCRIPTION_REACTIVATED: "Assinatura reativada",
};