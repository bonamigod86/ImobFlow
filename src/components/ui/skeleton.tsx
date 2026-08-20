import { cn } from "@/lib/utils";

/** Shadcn-style loading block used while dashboard data streams in. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-ink-700/60", className)} {...props} />;
}

export { Skeleton };