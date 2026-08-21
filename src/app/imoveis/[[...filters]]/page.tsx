import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/portal/SiteHeader";
import { SiteFooter } from "@/components/portal/SiteFooter";
import { SearchFilters } from "@/components/portal/SearchFilters";
import { PropertyCard } from "@/components/portal/PropertyCard";
import { Pagination } from "@/components/portal/Pagination";
import { listCities, searchListings, resolveCitySlug } from "@/lib/public/repository";
import { CATEGORY_FROM_SLUG, CATEGORY_LABELS, TARGET_FROM_SLUG, TARGET_LABELS } from "@/lib/public/types";
import type { PublicListingFilters } from "@/lib/public/types";
import { searchMetadata } from "@/lib/public/seo";

export const revalidate = 60;

interface PageProps {
  params: { filters?: string[] };
  searchParams: Record<string, string | string[] | undefined>;
}

function parseFilters(filters?: string[]): { citySlug?: string; target?: PublicListingFilters["target"]; category?: PublicListingFilters["category"] } {
  if (!filters || filters.length === 0) return {};
  // Support both `/imoveis/[city]/[target]/[category]` and shallow `/imoveis/venda`
  const [a = "", b = "", c = ""] = filters;
  if (TARGET_FROM_SLUG[a]) return { target: TARGET_FROM_SLUG[a], ...(b ? { category: CATEGORY_FROM_SLUG[b] } : {}) };
  if (CATEGORY_FROM_SLUG[a]) return { category: CATEGORY_FROM_SLUG[a] };
  // City-led form (strictly 1..3 segments: city, [target], [category])
  return {
    citySlug: a || undefined,
    ...(b ? { target: TARGET_FROM_SLUG[b] } : {}),
    ...(c ? { category: CATEGORY_FROM_SLUG[c] } : {}),
  };
}

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function isUnknownCity(filters: string[] | undefined, cityLabel: string | null | undefined): boolean {
  if (!filters || filters.length === 0) return false;
  const first = filters[0] ?? "";
  const isTargetOrCategory = Boolean(TARGET_FROM_SLUG[first] ?? CATEGORY_FROM_SLUG[first]);
  if (isTargetOrCategory) return false;
  return !cityLabel || cityLabel.length === 0;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const data = await getSearchData(params.filters, searchParams);
  return searchMetadata(data.result, data.cityLabel);
}

async function getSearchData(filters?: string[], sp: Record<string, string | string[] | undefined> = {}) {
  const parsed = parseFilters(filters);
  const q = single(sp.q);
  const neighborhood = single(sp.neighborhood);
  const minPrice = Number(single(sp.minPrice) ?? NaN);
  const maxPrice = Number(single(sp.maxPrice) ?? NaN);
  const minBedrooms = Number(single(sp.minBedrooms) ?? NaN);
  const minSuites = Number(single(sp.minSuites) ?? NaN);
  const minBathrooms = Number(single(sp.minBathrooms) ?? NaN);
  const minParking = Number(single(sp.minParking) ?? NaN);
  const minArea = Number(single(sp.minArea) ?? NaN);
  const furnished = single(sp.furnished) === "true";
  const page = Math.max(1, Number(single(sp.page) ?? 1) || 1);
  const sort = (single(sp.sort) ?? "relevance") as PublicListingFilters["target"] extends never ? never : "relevance";

  const base: PublicListingFilters = {
    citySlug: parsed.citySlug,
    target: parsed.target,
    category: parsed.category,
    q,
    ...(neighborhood ? { neighborhood } : {}),
    ...(Number.isFinite(minPrice) ? { minPrice } : {}),
    ...(Number.isFinite(maxPrice) ? { maxPrice } : {}),
    ...(Number.isFinite(minBedrooms) ? { minBedrooms } : {}),
    ...(Number.isFinite(minSuites) ? { minSuites } : {}),
    ...(Number.isFinite(minBathrooms) ? { minBathrooms } : {}),
    ...(Number.isFinite(minParking) ? { minParking } : {}),
    ...(Number.isFinite(minArea) ? { minArea } : {}),
    ...(furnished ? { furnished: true } : {}),
  };

  if (sp.featured === "true") base.featured = true;

  const [result, cityMatches, cities] = await Promise.all([
    searchListings(base, { page, sort: sort as never }),
    parsed.citySlug ? resolveCitySlug(parsed.citySlug) : Promise.resolve([]),
    listCities(),
  ]);

  const cityLabel = cityMatches.length > 0 ? cityMatches.map((c) => c.city).join(" · ") : (parsed.citySlug ?? null);
  const titleBits = [
    parsed.citySlug ? cityLabel : null,
    parsed.target ? TARGET_LABELS[parsed.target] : null,
    parsed.category ? CATEGORY_LABELS[parsed.category] : null,
  ].filter(Boolean);

  return {
    result,
    cityLabel: cityLabel ?? null,
    citySlug: parsed.citySlug ?? null,
    cities,
    title: titleBits.length ? titleBits.join(" · ") : "Imóveis",
  };
}

export default async function SearchPage({ params, searchParams }: PageProps) {
  const { filters } = params;
  const data = await getSearchData(filters, searchParams);
  const { result, cityLabel } = data;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else if (v != null) sp.set(k, v);
  }

  const basePath = filters?.length ? `/imoveis/${filters.join("/")}` : "/imoveis";
  const hasActiveFilter = sp.size > 0;

  // Bogus city segment (e.g. `/imoveis/nao-existe/...`) — 404 instead of an empty
  // near-duplicate search page so crawlers don't index dead URLs.
  if (isUnknownCity(filters, cityLabel)) {
    redirect("/imoveis");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          {filters?.length || filters ? (
            <nav aria-label="breadcrumb" className="text-sm text-slate-400">
              <span>Home</span>
              {filters?.map((f, i) => (
                <span key={i}>
                  {" "}/ <span className="capitalize text-slate-600">{f.replace(/-/g, " ")}</span>
                </span>
              ))}
            </nav>
          ) : (
            <p className="text-sm font-medium uppercase tracking-widest text-brand-600">Busca</p>
          )}
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{data.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {result.total > 0 ? (
              <>
                {result.total} {result.total === 1 ? "imóvel encontrado" : "imóveis encontrados"}
                {hasActiveFilter ? " com os filtros aplicados" : ""}.
              </>
            ) : (
              "Nenhum imóvel corresponde aos filtros selecionados."
            )}
          </p>
        </header>

        <SearchFilters
          initial={{
            q: single(searchParams.q),
            target: result.filters.target,
            category: result.filters.category,
            sort: single(searchParams.sort),
            city: data.citySlug ?? undefined,
          }}
          cities={data.cities}
        />

        {result.total > 0 ? (
          <>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((p, i) => (
                <PropertyCard key={p.id} property={p} priority={i < 3} />
              ))}
            </div>
            <Pagination page={result.page} pageCount={result.pageCount} basePath={basePath} searchParams={sp} />
          </>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <p className="font-semibold text-slate-800">Nenhum resultado</p>
            <p className="mt-1 text-sm text-slate-500">Tente remover alguns filtros para ampliar a busca.</p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}