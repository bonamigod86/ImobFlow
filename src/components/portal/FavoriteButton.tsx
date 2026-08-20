"use client";

import { useCallback, useState } from "react";
import { Heart } from "lucide-react";
import { isFavorite, toggleFavorite } from "@/lib/public/favorites";

/**
 * Heart toggle that persists a listing on the visitor's device (no account
 * needed). Used on the card grid and the PDP; state survives reloads.
 */
export function FavoriteButton({
  propertyId,
  className = "",
}: {
  propertyId: string;
  className?: string;
}) {
  const [active, setActive] = useState(() => isFavorite(propertyId));

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const next = toggleFavorite(propertyId);
      setActive(next.includes(propertyId));
    },
    [propertyId],
  );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      title={active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-colors ${
        active
          ? "bg-brand-600 text-white hover:bg-brand-700"
          : "bg-white/95 text-slate-500 hover:bg-white hover:text-brand-600"
      } ${className}`}
    >
      <Heart className={`h-4 w-4 ${active ? "fill-current" : ""}`} />
    </button>
  );
}