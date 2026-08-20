"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

const PRICE_BANDS = [
  { label: "Até R$ 200 mil", min: 0, max: 200000 },
  { label: "R$ 200 a R$ 500 mil", min: 200000, max: 500000 },
  { label: "R$ 500 mil a R$ 1 mi", min: 500000, max: 1000000 },
  { label: "R$ 1 a R$ 2 mi", min: 1000000, max: 2000000 },
  { label: "Acima de R$ 2 mi", min: 2000000, max: undefined },
];

const SORTS = [
  { value: "relevance", label: "Mais relevantes" },
  { value: "newest", label: "Mais recentes" },
  { value: "lowest_price", label: "Menor preço" },
  { value: "highest_price", label: "Maior preço" },
  { value: "largest_area", label: "Maior área" },
];

function ReadonlySelect({
  value,
  onChange,
  children,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 ${className}`}
    >
      {children}
    </select>
  );
}

/**
 * Search & filter panel. Keeps the URL in sync (SSR-friendly: every selection
 * is a page navigation, honoring the "URL-synced filters" SEO requirement).
 */
export function SearchFilters({
  initial = {},
}: {
  initial?: {
    q?: string;
    target?: string;
    category?: string;
    priceBand?: string;
    minBedrooms?: string;
    sort?: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(patch)) {
        if (val == null || val === "") next.delete(key);
        else next.set(key, val);
      }
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [searchParams, pathname, router],
  );

  const currentPriceBand =
    PRICE_BANDS.find((b) => String(b.min) === searchParams.get("minPrice") && String(b.max ?? "") === (searchParams.get("maxPrice") ?? "")) === undefined
      ? ""
      : String(PRICE_BANDS.findIndex(
          (b) => String(b.min) === searchParams.get("minPrice") && String(b.max ?? "") === (searchParams.get("maxPrice") ?? ""),
        ));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-800">Filtros</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="col-span-2 md:col-span-3 lg:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-500">Buscar por texto</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              defaultValue={initial.q ?? searchParams.get("q") ?? ""}
              placeholder="Cidade, bairro, código…"
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              onKeyDown={(e) => {
                if (e.key === "Enter") apply({ q: (e.target as HTMLInputElement).value });
              }}
            />
          </div>
        </div>

        <ReadonlySelect
          value={searchParams.get("target") ?? initial.target ?? ""}
          onChange={(v) => apply({ target: v })}
        >
          <option value="">Venda ou aluguel</option>
          <option value="SALE">À venda</option>
          <option value="RENT">Para alugar</option>
          <option value="BOTH">Venda e aluguel</option>
        </ReadonlySelect>

        <ReadonlySelect
          value={searchParams.get("category") ?? initial.category ?? ""}
          onChange={(v) => apply({ category: v })}
        >
          <option value="">Qualquer categoria</option>
          <option value="APARTMENT">Apartamento</option>
          <option value="HOUSE">Casa</option>
          <option value="COMMERCIAL">Comercial</option>
          <option value="LAND">Terreno</option>
          <option value="FARM">Fazenda</option>
          <option value="OFFICE">Sala comercial</option>
          <option value="GARAGE">Vaga de garagem</option>
          <option value="OTHER">Outros</option>
        </ReadonlySelect>

        <ReadonlySelect
          value={currentPriceBand || ""}
          onChange={(v) => {
            if (!v) return apply({ minPrice: null, maxPrice: null });
            const band = PRICE_BANDS[Number(v)];
            if (!band) return apply({ minPrice: null, maxPrice: null });
            apply({ minPrice: String(band.min), maxPrice: band.max != null ? String(band.max) : null });
          }}
        >
          <option value="">Qualquer preço</option>
          {PRICE_BANDS.map((b, i) => (
            <option key={i} value={i}>
              {b.label}
            </option>
          ))}
        </ReadonlySelect>

        <ReadonlySelect
          value={searchParams.get("minBedrooms") ?? initial.minBedrooms ?? ""}
          onChange={(v) => apply({ minBedrooms: v })}
        >
          <option value="">Quartos</option>
          <option value="1">1+</option>
          <option value="2">2+</option>
          <option value="3">3+</option>
          <option value="4">4+</option>
        </ReadonlySelect>

        <ReadonlySelect
          value={searchParams.get("sort") ?? initial.sort ?? "relevance"}
          onChange={(v) => apply({ sort: v })}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </ReadonlySelect>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          A cada filtro, a busca atualiza a URL para compartilhamento e indexação.
        </p>
        {pending && <span className="text-xs font-medium text-brand-600">Atualizando…</span>}
        {(searchParams.size > 0 || initial.q) && (
          <button
            type="button"
            onClick={() => router.push(pathname, { scroll: false })}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}