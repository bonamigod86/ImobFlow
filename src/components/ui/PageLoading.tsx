import { Loader2 } from "lucide-react";

/**
 * Instant navigation feedback (App Router `loading.tsx`).
 *
 * Rendered inside the target segment the moment a link is clicked, while the
 * server component streams — removes the "frozen page" feel on slow data
 * fetches. Pure presentational: safe in server and client contexts.
 */
export default function PageLoading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <span className="relative flex h-14 w-14 items-center justify-center">
          <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-emerald-400/25" />
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </span>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}

/** Shimmering placeholder block used by route-specific skeletons. */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />;
}
