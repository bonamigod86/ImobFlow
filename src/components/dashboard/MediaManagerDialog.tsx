"use client";

import { useCallback, useEffect, useState } from "react";
import { Image as ImageIcon, Loader2, Star, StarOff, Trash2, Upload, Video, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PropertyMediaRow, PropertyRow } from "@/components/dashboard/types";

/**
 * Media manager dialog — the "Fotos e vídeos" gallery for one property.
 *
 * Uploads register a PENDING row via the API; when the platform has real object
 * storage the client PUTs the bytes to the returned presigned URL and the
 * processing worker is responsible for finalizing. In local dev (no S3) the
 * bytes are posted to /api/media/[id]/bytes and finalized server-side — both
 * paths converge on the same READY row.
 */
export function MediaManagerDialog({
  property,
  onClose,
  onChanged,
}: {
  property: PropertyRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const open = !!property;
  const [media, setMedia] = useState<PropertyMediaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!property) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${property.id}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Falha ao carregar a mídia.");
      setMedia((body.property?.media ?? []) as PropertyMediaRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar a mídia.");
    } finally {
      setLoading(false);
    }
  }, [property]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  async function uploadFile(file: File, kind: "IMAGE" | "VIDEO") {
    if (!property) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${property.id}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, mimeType: file.type, sizeBytes: file.size }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Falha ao registrar o upload.");

      if (body.uploadUrl && (body.uploadUrl as string).startsWith("http")) {
        await fetch(body.uploadUrl, { method: "PUT", body: file });
      } else {
        // Local dev fallback — store the bytes server-side.
        const storeRes = await fetch(`/api/media/${body.mediaId}/bytes`, { method: "POST", body: file });
        if (!storeRes.ok) throw new Error("Falha ao gravar a mídia localmente.");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(mediaId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/media/${mediaId}/primary`, { method: "PATCH" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Falha ao definir a imagem principal.");
      await refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao definir a imagem principal.");
    }
  }

  async function remove(mediaId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/media/${mediaId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Falha ao remover a mídia.");
      await refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao remover a mídia.");
    }
  }

  const images = media.filter((m) => m.kind === "IMAGE");
  const videos = media.filter((m) => m.kind === "VIDEO");

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-brand-400" />
            Fotos e vídeos
          </DialogTitle>
          <DialogDescription>
            {property?.title ?? ""} — adicione imagens e vídeos, defina a capa e remova arquivos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <input
            id="media-image-file"
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file, "IMAGE");
              e.target.value = "";
            }}
          />
          <label htmlFor="media-image-file" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Adicionar imagem
          </label>
          <input
            id="media-video-file"
            type="file"
            accept="video/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file, "VIDEO");
              e.target.value = "";
            }}
          />
          <label htmlFor="media-video-file" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Video className="h-4 w-4" />
            )}
            Adicionar vídeo
          </label>
        </div>

        {error && (
          <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-sm text-ink-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando mídia…
          </div>
        ) : media.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-700 px-4 py-8 text-center text-sm text-ink-400">
            Nenhuma foto ou vídeo ainda.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((item) => (
              <MediaTile
                key={item.id}
                item={item}
                primary={item.isPrimary}
                onPrimary={item.status === "READY" ? () => void setPrimary(item.id) : undefined}
                onRemove={() => void remove(item.id)}
              />
            ))}
            {videos.map((item) => (
              <MediaTile key={item.id} item={item} onRemove={() => void remove(item.id)} />
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            <X className="mr-1 h-4 w-4" />
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MediaTile({
  item,
  primary,
  onPrimary,
  onRemove,
}: {
  item: PropertyMediaRow;
  primary?: boolean;
  onPrimary?: () => void;
  onRemove: () => void;
}) {
  const src = `/api/media/${item.id}/bytes`;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="relative">
        {item.kind === "IMAGE" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="Mídia do imóvel" className="aspect-[4/3] w-full object-cover" />
        ) : (
          <video
            src={src}
            preload="metadata"
            controls
            className="aspect-[4/3] w-full bg-black object-cover"
          />
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {primary && (
            <Badge variant="success" className="gap-1">
              <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
              Capa
            </Badge>
          )}
          {item.status !== "READY" && (
            <Badge variant="outline" className="text-[0.65rem]">
              {item.status}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 p-2">
        {onPrimary && (
          <Button
            size="sm"
            variant="secondary"
            className="whitespace-nowrap px-2.5 text-xs"
            onClick={onPrimary}
          >
            {primary ? <StarOff className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />}
            {primary ? "Remover capa" : "Tornar capa"}
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          className="whitespace-nowrap px-2.5 text-xs"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remover
        </Button>
      </div>
    </div>
  );
}