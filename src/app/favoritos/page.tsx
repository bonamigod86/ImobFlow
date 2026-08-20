"use client";

import { useEffect, useState } from "react";
import { Heart, Home } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/portal/SiteHeader";
import { SiteFooter } from "@/components/portal/SiteFooter";
import { PropertyCard } from "@/components/portal/PropertyCard";
import { readFavorites, toggleFavorite } from "@/lib/public/favorites";
import type { PublicProperty } from "@/lib/public/types";

export default function FavoritesPage() {
  const [items, setItems] = useState<PublicProperty[] | null>(null);

  useEffect(() => {
    const ids = readFavorites();
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    fetch(`/api/public/listings?ids=${encodeURIComponent(ids.join(","))}`)
      .then((r) => r.json())
      .then((d) => setItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setItems([]));
  }, []);

  function removeItem(id: string) {
    toggleFavorite(id);
    setItems((prev) => prev?.filter((p) => p.id !== id) ?? []);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <p className="text-sm font-medium uppercase tracking-widest text-brand-600">Favoritos</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Meus favoritos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Imóveis salvos neste dispositivo para acompanhar depois.
          </p>
        </header>

        {items === null ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <Heart className="mx-auto h-12 w-12 text-slate-200" />
            <p className="mt-4 font-semibold text-slate-800">Nenhum favorito ainda</p>
            <p className="mt-1 text-sm text-slate-500">
              Toque no coração de um imóvel para salvá-lo aqui.
            </p>
            <Link
              href="/imoveis"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              <Home className="h-4 w-4" />
              Explorar imóveis
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <div key={p.id} className="relative">
                <PropertyCard property={p} />
                <button
                  type="button"
                  onClick={() => removeItem(p.id)}
                  aria-label={`Remover ${p.title} dos favoritos`}
                  className="absolute -top-2 -right-2 z-10 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 shadow-md transition-colors hover:text-red-600"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}