/** pt-BR real formatting from integer cents (e.g. 4250000 -> "R$ 42.500,00"). */
export function formatCentsBRL(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  return (safe / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}