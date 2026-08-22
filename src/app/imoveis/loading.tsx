import { SkeletonBlock } from "@/components/ui/PageLoading";

/** Listing skeleton: search bar + property-card grid placeholders. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 sm:flex-row sm:items-center">
        <SkeletonBlock className="h-10 flex-1" />
        <SkeletonBlock className="h-10 w-full sm:w-40" />
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <SkeletonBlock className="aspect-[16/10] w-full rounded-none" />
            <div className="space-y-2.5 p-4">
              <SkeletonBlock className="h-4 w-3/4" />
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-9 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
