import { PlayCircle } from "lucide-react";
import type { PublicMedia } from "@/lib/public/types";

/**
 * Video walkthroughs on the PDP. Server-rendered native players (no extra
 * JS); `preload="none"` + poster keeps the page light.
 */
export function VideoGallery({ videos, poster }: { videos: PublicMedia[]; poster?: string | null }) {
  if (videos.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <PlayCircle className="h-5 w-5 text-brand-600" />
        Vídeos do imóvel
      </h2>
      <div className={`grid gap-4 ${videos.length > 1 ? "md:grid-cols-2" : ""}`}>
        {videos.map((v) => (
          <div key={v.id} className="overflow-hidden rounded-xl bg-slate-950">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              controls
              preload="none"
              poster={poster ?? undefined}
              className="aspect-video w-full object-contain"
              src={v.url}
            >
              Seu navegador não consegue reproduzir este vídeo.
            </video>
          </div>
        ))}
      </div>
    </section>
  );
}