"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Loader2, Trash2 } from "lucide-react";
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
import { PropertyThumb } from "@/components/dashboard/PropertyThumb";
import { FormDialog } from "@/components/dashboard/PropertyFormDialog";
import type { PropertyRow } from "@/components/dashboard/types";
import { CATEGORY_LABELS } from "@/lib/public/types";
import {
  STATUS_LABELS,
  STATUS_BADGE_VARIANTS,
  TARGET_LABELS,
  locationForRow,
  priceForRow,
} from "@/components/dashboard/format";

export type PropertyAction =
  | { kind: "new" }
  | { kind: "view"; property: PropertyRow }
  | { kind: "edit"; property: PropertyRow }
  | { kind: "delete"; property: PropertyRow };

interface PropertyDialogsProps {
  action: PropertyAction | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Modal suite driven by the property table — view details, create/edit form
 * and a destructive delete confirmation. Mutations hit the tenant-scoped API
 * and report the result back to the table via `onSaved`.
 */
export function PropertyDialogs({ action, onClose, onSaved }: PropertyDialogsProps) {
  return (
    <>
      <ViewDialog action={action} onClose={onClose} />
      <FormDialog action={action} onClose={onClose} onSaved={onSaved} />
      <DeleteDialog action={action} onClose={onClose} onSaved={onSaved} />
    </>
  );
}

function ViewDialog({ action, onClose }: { action: PropertyAction | null; onClose: () => void }) {
  const property = action?.kind === "view" ? action.property : null;
  return (
    <Dialog open={!!property} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {property && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8">{property.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-xs">{property.code}</code>
                <Badge variant={STATUS_BADGE_VARIANTS[property.status]}>
                  {STATUS_LABELS[property.status]}
                </Badge>
                <Badge variant="secondary">{TARGET_LABELS[property.target]}</Badge>
                <Badge variant="outline">{CATEGORY_LABELS[property.category as keyof typeof CATEGORY_LABELS]}</Badge>
              </DialogDescription>
            </DialogHeader>

            <PropertyThumb
              url={property.coverImage}
              title={property.title}
              category={property.category}
              className="h-40 w-full"
            />

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              <ViewField label="Localização" value={locationForRow(property)} />
              <ViewField
                label="Preço"
                value={`${priceForRow(property).label}${priceForRow(property).period ?? ""}`}
              />
              <ViewField
                label="Área"
                value={property.area ? `${Number(property.area).toLocaleString("pt-BR")} m²` : "—"}
              />
              <ViewField label="Quartos" value={property.bedrooms?.toString() ?? "—"} />
              <ViewField label="Suítes" value={property.suites?.toString() ?? "—"} />
              <ViewField label="Banheiros" value={property.bathrooms?.toString() ?? "—"} />
              <ViewField label="Vagas" value={property.parkingSpots?.toString() ?? "—"} />
              <ViewField label="Status no portal" value={property.isActive ? "Publicado" : "Oculto"} />
              <ViewField label="Destaque" value={property.isFeatured ? "Sim" : "Não"} />
            </dl>

            {property.description && (
              <p className="rounded-lg border border-ink-700 bg-ink-950/40 px-3 py-2 text-sm leading-relaxed text-ink-200">
                {property.description}
              </p>
            )}

            <DialogFooter className="gap-2">
              {property.slug && (
                <Link
                  href={`/imovel/${encodeURIComponent(property.slug)}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Abrir no portal
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
              <Button variant="secondary" size="sm" onClick={onClose}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ViewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="text-sm text-ink-100">{value}</dd>
    </div>
  );
}

function DeleteDialog({
  action,
  onClose,
  onSaved,
}: {
  action: PropertyAction | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const property = action?.kind === "delete" ? action.property : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!property) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${property.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Falha ao excluir o imóvel.");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir o imóvel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!property} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-400" />
            Excluir imóvel
          </DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir <span className="font-medium text-ink-100">{property?.title}</span>{" "}
            ({property?.code})? Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-300">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}