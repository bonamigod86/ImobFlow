"use client";

import Image from "next/image";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import type { PublicMedia } from "@/lib/public/types";

/**
 * Renders a media image. Same-origin URLs (local `/api/media/[id]/bytes`) need a
 * plain <img> — next/image would fetch server-side and lose the session cookie.
 */
function GalleryImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  if (src.startsWith("/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} className={className} />;
  }
  return <Image src={src} alt={alt} fill sizes="100vw" className={className} />;
}

/**
 * Client-side gallery with a lightbox. Renders the thumbnails/progressive
 * images via next/image; the full-screen overlay uses Radix Dialog for
 * a11y (focus trap, ESC to close, aria).
 */
export function Gallery({
  images,
  title,
}: {
  images: PublicMedia[];
  title: string;
}) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  if (images.length === 0) return null;

  const first = images[0];
  const current = first ? (images[active] ?? first) : null;
  const prev = () => setActive((a) => (a - 1 + images.length) % images.length);
  const next = () => setActive((a) => (a + 1) % images.length);

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-100">
      {/* Hero */}
      <button
        type="button"
        className="relative block aspect-[16/10] w-full cursor-zoom-in"
        onClick={() => setOpen(true)}
        aria-label="Ampliar foto"
      >
        <GalleryImage
          src={current!.url}
          alt={`${title} — foto ${active + 1}`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
          <Expand className="h-3.5 w-3.5" />
          {images.length > 1 ? `1 / ${images.length}` : "Ampliar"}
        </span>
      </button>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-3">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              className={`relative h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                i === active ? "border-brand-600" : "border-transparent opacity-70 hover:opacity-100"
              }`}
              aria-label={`Selecionar foto ${i + 1}`}
            >
              <GalleryImage src={img.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-0 z-50 flex h-full w-full flex-col items-center justify-center p-4">
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            <div className="relative flex h-full w-full max-w-6xl items-center justify-center">
              <GalleryImage
                src={current!.url}
                alt={`${title} — foto ${active + 1}`}
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>

            <button
              type="button"
              onClick={prev}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 text-slate-800 shadow-lg transition-colors hover:bg-white"
              aria-label="Foto anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 text-slate-800 shadow-lg transition-colors hover:bg-white"
              aria-label="Próxima foto"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <Dialog.Close
              className="absolute right-4 top-4 rounded-full bg-white/90 p-3 text-slate-800 shadow-lg transition-colors hover:bg-white"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>

            <div className="absolute bottom-6 rounded-full bg-white/90 px-4 py-1.5 text-sm font-medium text-slate-800">
              {active + 1} / {images.length}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}