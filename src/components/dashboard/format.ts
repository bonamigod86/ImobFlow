import type { PropertyStatus, PropertyRow } from "@/components/dashboard/types";
import type { TenantStatus, UserRole } from "@prisma/client";
import { formatBRL } from "@/lib/public/format";

/** pt-BR labels shared across the tenant dashboard. */

export const ROLE_LABELS: Record<UserRole, string> = {
  MASTER: "Administrador da plataforma",
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  AGENT: "Corretor",
  RECEPTIONIST: "Recepção",
};

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  ACTIVE: "Ativo",
  TRIAL: "Avaliação",
  PENDING_DUE: "Pendente",
  PAST_DUE: "Inadimplente",
  BLOCKED: "Bloqueado",
  CANCELLED: "Cancelado",
};

export const TENANT_STATUS_VARIANTS: Record<
  TenantStatus,
  "success" | "info" | "warning" | "danger"
> = {
  ACTIVE: "success",
  TRIAL: "info",
  PENDING_DUE: "warning",
  PAST_DUE: "warning",
  BLOCKED: "danger",
  CANCELLED: "danger",
};

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  SOLD: "Vendido",
  RENTED: "Alugado",
};

export const STATUS_BADGE_VARIANTS: Record<PropertyStatus, "success" | "secondary" | "neutral" | "info"> = {
  ACTIVE: "success",
  INACTIVE: "secondary",
  SOLD: "neutral",
  RENTED: "info",
};

export const TARGET_LABELS: Record<PropertyRow["target"], string> = {
  SALE: "Venda",
  RENT: "Aluguel",
  BOTH: "Venda e aluguel",
};

export interface PriceLabel {
  label: string;
  period?: string;
}

/** Price label for a dashboard property row (BRL, pt-BR locale). */
export function priceForRow(row: PropertyRow): PriceLabel {
  if (row.target === "RENT" && row.rentPrice) {
    return { label: formatBRL(row.rentPrice), period: "/mês" };
  }
  if (row.salePrice) return { label: formatBRL(row.salePrice) };
  if (row.rentPrice) return { label: formatBRL(row.rentPrice), period: "/mês" };
  return { label: "Consultar" };
}

export function locationForRow(row: PropertyRow): string {
  const parts = [row.neighborhood, row.city, row.state].filter(Boolean);
  return parts.join(", ");
}

/** Progress 0..100 for a quota cell; `null` when the plan grants unlimited. */
export function usagePercent(used: number, max: number | null): number | null {
  if (max === null) return null;
  if (max <= 0) return 0;
  return Math.round((used / max) * 100);
}

/** Quota bar fill color by utilization share. */
export function usageTone(pct: number | null): string {
  if (pct === null) return "";
  if (pct >= 90) return "bg-red-400";
  if (pct >= 75) return "bg-amber-400";
  return "bg-brand-500";
}

type Delta = "up" | "down" | "flat" | "new" | null;

/**
 * Compare the last 7 days against the average of the previous three weeks,
 * derived from the 30d total and the current 7d slice (no extra API needed).
 */
export function deltaPct(current7d: number, total30d: number): { delta: Delta; pct: number | null } {
  const previousWeeksTotal = Math.max(0, total30d - current7d);
  const previousWeeklyAvg = previousWeeksTotal / 3;
  if (previousWeeklyAvg <= 0) {
    return current7d > 0 ? { delta: "new", pct: null } : { delta: "flat", pct: 0 };
  }
  const pct = Math.round(((current7d - previousWeeklyAvg) / previousWeeklyAvg) * 100);
  if (pct > 0) return { delta: "up", pct };
  if (pct < 0) return { delta: "down", pct };
  return { delta: "flat", pct: 0 };
}

/** Format a photo-count / plain integer with a pt-BR group separator. */
export function formatCount(value: number): string {
  return value.toLocaleString("pt-BR");
}

/** Format a 0..1 ratio as a whole percent, e.g. 0.042 → "4%". */
export function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

/** Format an ISO date string as pt-BR (dd/mm/yyyy). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}