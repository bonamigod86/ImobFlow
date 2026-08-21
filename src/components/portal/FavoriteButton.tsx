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
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-all ${
        active
          ? "border-red-200 bg-white text-red-500 hover:scale-110"
          : "border-white/80 bg-white/95 text-slate-400 hover:scale-110 hover:bg-white hover:text-red-500"
      } ${className}`}
    >
      <Heart
        className={`h-5 w-5 ${active ? "fill-current" : ""}`}
        strokeWidth={2}
        aria-hidden="true"
      />
    </button>
  );
}