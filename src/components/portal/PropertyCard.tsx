import Image from "next/image";
import Link from "next/link";
import { BedDouble, Car, MapPin, Ruler, Bath } from "lucide-react";
import type { PublicProperty } from "@/lib/public/types";
import { CATEGORY_LABELS, CATEGORY_PLACEHOLDERS } from "@/lib/public/types";
import { locationLabel, priceFor } from "@/lib/public/format";
import { FavoriteButton } from "@/components/portal/FavoriteButton";

/** Cover image for a listing; falls back to the category placeholder or a clean branded tile. */
export function ListingImage({
  property,
  className = "aspect-[4/3]",
  priority = false,
}: {
  property: PublicProperty;
  className?: string;
  priority?: boolean;
}) {
  const cover = property.coverImage;
  if (cover?.url) {
    return (
      <Image
        src={cover.url}
        alt={property.title}
        fill
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        priority={priority}
        className={`${className} object-cover`}
      />
    );
  }

  const placeholder = CATEGORY_PLACEHOLDERS[property.category];
  if (placeholder) {
    return (
      <Image
        src={placeholder}
        alt={CATEGORY_LABELS[property.category]}
        fill
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        priority={priority}
        className={`${className} object-cover`}
      />
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center bg-gradient-to-br from-brand-600 via-brand-500 to-brand-400 text-white`}
      aria-label={property.title}
    >
      <span className="text-4xl font-semibold tracking-tight">
        {CATEGORY_LABELS[property.category]}
      </span>
    </div>
  );
}

/** Static (server-rendered) property card used on grids — zero client JS. */
export function PropertyCard({ property, priority = false }: { property: PublicProperty; priority?: boolean }) {
  const price = priceFor(property);
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-lg">
      <Link
        href={`/imovel/${encodeURIComponent(property.slug ?? "")}`}
        className="block"
      >
        <div className="relative">
          <div className="relative aspect-[4/3] w-full">
            <ListingImage property={property} priority={priority} />
          </div>
          {property.isFeatured && (
            <span className="absolute left-3 top-3 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
              Destaque
            </span>
          )}
          <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm">
            {CATEGORY_LABELS[property.category]}
          </span>
          <div className="absolute bottom-3 right-3 rounded-lg bg-slate-950/70 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-sm">
            {price.label}
            {price.period && <span className="text-xs font-medium text-slate-200">{price.period}</span>}
          </div>
        </div>

        <div className="p-4">
          <h3 className="truncate font-semibold text-slate-900 group-hover:text-brand-600">{property.title}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{locationLabel(property, { withNeighborhood: true })}</span>
          </p>

          <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
            {property.bedrooms != null && (
              <span className="flex items-center gap-1.5">
                <BedDouble className="h-4 w-4 text-slate-400" />
                {property.bedrooms}
              </span>
            )}
            {property.bathrooms != null && (
              <span className="flex items-center gap-1.5">
                <Bath className="h-4 w-4 text-slate-400" />
                {property.bathrooms}
              </span>
            )}
            {property.parkingSpots != null && (
              <span className="flex items-center gap-1.5">
                <Car className="h-4 w-4 text-slate-400" />
                {property.parkingSpots}
              </span>
            )}
            {property.area != null && (
              <span className="ml-auto flex items-center gap-1.5">
                <Ruler className="h-4 w-4 text-slate-400" />
                {Number(property.area).toLocaleString("pt-BR")}
                <span className="text-xs text-slate-400">m²</span>
              </span>
            )}
          </div>
        </div>
      </Link>
      <div className="absolute right-3 top-3 z-10">
        <FavoriteButton propertyId={property.id} />
      </div>
    </div>
  );
}