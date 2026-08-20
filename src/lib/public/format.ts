import type { PublicProperty } from "@/lib/public/types";

/** Format a BRL value stored as a numeric string ("750000.00" → "R$ 750.000"). */
export function formatBRL(value: string | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value == null) return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  let formatted: string;
  if (opts.compact && num >= 1_000_000) {
    const m = num / 1_000_000;
    formatted = `R$ ${m.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  } else {
    formatted = num.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  }
  // toLocaleString uses a non-breaking space as the thousands separator in
  // pt-BR on some ICU builds — normalize to a regular space for consistent
  // rendering, copy/paste and tests.
  return formatted.replace(/\s/g, " ");
}

/** Format a decimal area/m² string. */
export function formatArea(value: string | null | undefined): string {
  if (value == null) return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return `${num.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m²`;
}

/** Human price label for a listing, based on its target. */
export function priceFor(p: PublicProperty, opts: { compact?: boolean } = {}): {
  label: string;
  period?: string;
} {
  if (p.target === "RENT" && p.rentPrice) {
    return { label: formatBRL(p.rentPrice, opts) , period: "/mês" };
  }
  if (p.target === "BOTH" && p.salePrice) {
    return { label: formatBRL(p.salePrice, opts) };
  }
  if (p.salePrice) return { label: formatBRL(p.salePrice, opts) };
  if (p.rentPrice) return { label: formatBRL(p.rentPrice, opts), period: "/mês" };
  return { label: "Consultar" };
}

/** Location label: "São Paulo, SP" (or with neighborhood for PDPs). */
export function locationLabel(p: PublicProperty, opts: { withNeighborhood?: boolean } = {}): string {
  const parts = [opts.withNeighborhood ? p.neighborhood : null, p.city, p.state].filter(Boolean);
  return parts.join(", ");
}