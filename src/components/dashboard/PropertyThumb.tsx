import Image from "next/image";
import { Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS } from "@/lib/public/types";

/** CDN origins allowed by next.config so `next/image` can be used safely. */
const ALLOWED_IMAGE_HOSTS = new Set(["cdn.tenant-media.example.com"]);

function isAllowedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Compact listing thumbnail with the same branded fallback the public portal
 * uses — a gradient tile labelled with the category when no cover exists.
 */
export function PropertyThumb({
  url,
  title,
  category,
  className,
}: {
  url?: string | null;
  title: string;
  category: string;
  className?: string;
}) {
  const allowed = isAllowedUrl(url);
  const base = cn("overflow-hidden rounded-md bg-ink-800", className);
  const imageUrl = allowed ? url : null;
  if (!imageUrl) {
    return (
      <div
        className={cn(
          base,
          "flex items-center justify-center bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400",
        )}
        aria-label={title}
      >
        <Building2 className="h-5 w-5 text-white/85" />
      </div>
    );
  }
  return (
    <div className={cn(base, "relative")}>
      <Image
        src={imageUrl}
        alt={CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? title}
        fill
        sizes="96px"
        className="object-cover"
      />
    </div>
  );
}