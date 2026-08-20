import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Server-rendered pagination. Builds `?page=N` links preserving every other
 * query param from the current URL.
 */
export function Pagination({
  page,
  pageCount,
  basePath,
  searchParams,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  searchParams: URLSearchParams;
}) {
  if (pageCount <= 1) return null;

  const hrefFor = (p: number) => {
    const next = new URLSearchParams(searchParams);
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const ordered = Array.from(pages)
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  const cls =
    "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-medium transition-colors";

  return (
    <nav aria-label="Paginação" className="flex items-center justify-center gap-1.5 py-8">
      {page > 1 && (
        <Link href={hrefFor(page - 1)} className={`${cls} text-slate-600 hover:border-brand-300 hover:text-brand-600`}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
      )}

      {ordered.map((p, i) => {
        const prev = ordered[i - 1];
        const hasGap = prev !== undefined && p - prev > 1;
        return (
          <span key={p} className="flex items-center gap-1.5">
            {hasGap && <span className="px-1 text-slate-400">…</span>}
            {p === page ? (
              <span aria-current="page" className={`${cls} border-brand-600 bg-brand-600 text-white`}>
                {p}
              </span>
            ) : (
              <Link href={hrefFor(p)} className={`${cls} text-slate-600 hover:border-brand-300 hover:text-brand-600`}>
                {p}
              </Link>
            )}
          </span>
        );
      })}

      {page < pageCount && (
        <Link href={hrefFor(page + 1)} className={`${cls} text-slate-600 hover:border-brand-300 hover:text-brand-600`}>
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </nav>
  );
}