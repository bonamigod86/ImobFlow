"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CATEGORY_LABELS, CATEGORY_SLUGS, TARGET_SLUGS } from "@/lib/public/types";

type Category = keyof typeof CATEGORY_SLUGS;
type Target = keyof typeof TARGET_SLUGS;

/**
 * Hero search form (home). Builds the portal's listing URL from free-text plus
 * target/category — keeps the same path/query contract as `/imoveis[...]`.
 */
export function HeroSearchForm() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<"" | Target>("");
  const [category, setCategory] = useState<"" | Category>("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const segments: string[] = [];
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
      className="mx-auto mt-8 flex w-full max-w-3xl flex-col gap-2 rounded-2xl border border-slate-200/70 bg-white p-2 shadow-xl shadow-slate-200/50 sm:flex-row sm:items-center"
    >
      <label className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cidade, bairro, código ou palavras-chave…"
          aria-label="Buscar imóveis"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 transition-colors focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <div className="flex gap-2">
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as "" | Target)}
          aria-label="Finalidade"
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Venda ou aluguel</option>
          <option value="SALE">Venda</option>
          <option value="RENT">Aluguel</option>
        </select>

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as "" | Category)}
          aria-label="Categoria"
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
        >
          <option value="">Todas as categorias</option>
          {(Object.keys(CATEGORY_SLUGS) as Category[]).map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="inline-flex shrink-0 items-center rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <Search className="mr-2 h-4 w-4" />
        Buscar
      </button>
    </form>
  );
}
