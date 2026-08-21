"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CATEGORY_LABELS, CATEGORY_SLUGS, TARGET_SLUGS } from "@/lib/public/types";

type Category = keyof typeof CATEGORY_SLUGS;
type Target = keyof typeof TARGET_SLUGS;

export interface HeroCity {
  slug: string;
  city: string;
  state?: string;
}

/**
 * Hero search form (home). Builds the portal's listing URL from city +
 * free-text + target/category — keeps the same path/query contract as
 * `/imoveis[city][target][category]?q=…`.
 */
export function HeroSearchForm({ cities = [] }: { cities?: HeroCity[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [target, setTarget] = useState<"" | Target>("");
  const [category, setCategory] = useState<"" | Category>("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const segments: string[] = [];
    if (city) segments.push(city);
    if (target) segments.push(TARGET_SLUGS[target]);
    if (category) segments.push(CATEGORY_SLUGS[category]);

    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    const query = sp.toString();
    router.push(`/imoveis${segments.length ? `/${segments.join("/")}` : ""}${query ? `?${query}` : ""}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto mt-8 grid max-w-5xl grid-cols-1 items-stretch gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-xl shadow-slate-200/70 md:grid-cols-12"
    >
      <label className="relative md:col-start-1 md:col-span-9 md:row-start-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Bairro, código ou palavras-chave…"
          aria-label="Buscar imóveis"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-500 transition-colors focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <select
        value={city}
        onChange={(e) => setCity(e.target.value)}
        aria-label="Cidade"
        className="md:col-start-1 md:col-span-3 md:row-start-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <option value="">Todas as cidades</option>
        {cities.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.city}
            {c.state ? ` · ${c.state}` : ""}
          </option>
        ))}
      </select>

      <select
        value={target}
        onChange={(e) => setTarget(e.target.value as "" | Target)}
        aria-label="Finalidade"
        className="md:col-start-4 md:col-span-3 md:row-start-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <option value="">Venda ou aluguel</option>
        <option value="SALE">Venda</option>
        <option value="RENT">Aluguel</option>
      </select>

      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as "" | Category)}
        aria-label="Categoria"
        className="md:col-start-7 md:col-span-3 md:row-start-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      >
        <option value="">Todas as categorias</option>
        {(Object.keys(CATEGORY_SLUGS) as Category[]).map((cat) => (
          <option key={cat} value={cat}>
            {CATEGORY_LABELS[cat]}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="md:col-start-10 md:col-span-3 md:row-start-1 md:row-span-2 inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <Search className="mr-2 h-4 w-4" />
        Buscar
      </button>
    </form>
  );
}
