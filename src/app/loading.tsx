import PageLoading from "@/components/ui/PageLoading";

/** Root fallback shown while any segment without its own loading.tsx streams. */
export default function Loading() {
  return <PageLoading />;
}
