import { SkeletonBlock } from "@/components/ui/PageLoading";

/** Property detail skeleton: gallery + info panel placeholders. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <SkeletonBlock className="h-5 w-64" />
      <div className="mt-4 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <SkeletonBlock className="aspect-[16/9] w-full" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="aspect-[4/3]" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-5">
          <SkeletonBlock className="h-7 w-2/3" />
          <SkeletonBlock className="h-10 w-1/2" />
          <SkeletonBlock className="h-24 w-full" />
          <SkeletonBlock className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
