import { TrendingDown, TrendingUp, Minus } from "lucide-react";

export function TrendArrow({ pct }: { pct: number | null }) {
  if (pct === null || Number.isNaN(pct)) {
    return (
      <span className="inline-flex items-center gap-1 text-ink-400">
        <Minus className="h-3.5 w-3.5" />
        <span>—</span>
      </span>
    );
  }
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium ${
        up ? "text-emerald-400" : "text-red-400"
      }`}
    >
      {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      <span>{up ? "+" : ""}{pct.toFixed(1).replace(".", ",")}%</span>
    </span>
  );
}

export function dateBR(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function timeAgoBR(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 0) return "agora";
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}