import type { PropertyCategory, PropertyTarget } from "@prisma/client";

/** A property as seen by the public portal — fully serializable, no Dates/Decimals. */
export interface PublicProperty {
  id: string;
  slug: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  code: string;
  title: string;
  description: string | null;
  target: PropertyTarget;
  category: PropertyCategory;
  salePrice: string | null;
  rentPrice: string | null;
  condoFee: string | null;
  propertyTax: string | null;
  address: string | null;
  number: string | null;
  city: string;
  state: string;
  neighborhood: string | null;
  zipCode: string | null;
  latitude: string | null;
  longitude: string | null;
  area: string | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  isFeatured: boolean;
  isFurnished: boolean;
  createdAt: string;
  updatedAt: string;
  /** Resolved, ready-to-render media entries (see public media pipeline). */
  images: PublicMedia[];
  /** Primary listing image, if any. */
  coverImage: PublicMedia | null;
  /** Video walkthroughs/tours attached to the listing. */
  videos: PublicMedia[];
  /** Attributed broker (an active AGENT/OWNER of the listing's tenant). */
  broker: PublicBroker | null;
}

export interface PublicMedia {
  id: string;
  url: string;
  kind: string;
  sortOrder: number;
  isPrimary: boolean;
  width: number | null;
  height: number | null;
  mimeType: string | null;
}

export interface PublicBroker {
  id: string;
  name: string;
  email: string;
  /** Contact phone (WhatsApp deep-link on the PDP); null when unset. */
  phone: string | null;
}

/** Normalized, URL-safe city slug used in routes: `/imoveis/sao-paulo/venda/...`. */
export interface PublicCity {
  city: string;
  state: string;
  slug: string;
  listingCount: number;
}

export interface PublicListingFilters {
  citySlug?: string;
  state?: string;
  target?: PropertyTarget;
  category?: PropertyCategory;
  neighborhood?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  minBedrooms?: number;
  minSuites?: number;
  minBathrooms?: number;
  minParking?: number;
  minArea?: number;
  featured?: boolean;
  furnished?: boolean;
}

export type PublicSort = "relevance" | "newest" | "lowest_price" | "highest_price" | "largest_area";

export interface PublicListingPage {
  items: PublicProperty[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  filters: PublicListingFilters;
  sort: PublicSort;
  cities: PublicCity[];
}

export const CATEGORY_LABELS: Record<PropertyCategory, string> = {
  APARTMENT: "Apartamento",
  HOUSE: "Casa",
  COMMERCIAL: "Comercial",
  LAND: "Terreno",
  FARM: "Fazenda",
  OFFICE: "Sala comercial",
  GARAGE: "Vaga de garagem",
  OTHER: "Imóvel",
};

export const TARGET_LABELS: Record<PropertyTarget, string> = {
  SALE: "Venda",
  RENT: "Aluguel",
  BOTH: "Venda e aluguel",
};

export const CATEGORY_SLUGS: Record<PropertyCategory, string> = {
  APARTMENT: "apartamento",
  HOUSE: "casa",
  COMMERCIAL: "comercial",
  LAND: "terreno",
  FARM: "fazenda",
  OFFICE: "sala-comercial",
  GARAGE: "garagem",
  OTHER: "imovel",
};

export const CATEGORY_FROM_SLUG: Record<string, PropertyCategory> = Object.fromEntries(
  Object.entries(CATEGORY_SLUGS).map(([cat, slug]) => [slug, cat as PropertyCategory]),
);

export const TARGET_SLUGS: Record<PropertyTarget, string> = {
  SALE: "venda",
  RENT: "aluguel",
  BOTH: "venda-e-aluguel",
};

export const TARGET_FROM_SLUG: Record<string, PropertyTarget> = Object.fromEntries(
  Object.entries(TARGET_SLUGS).map(([target, slug]) => [slug, target as PropertyTarget]),
);

/**
 * Static placeholder image per property category (used when a listing has no
 * cover yet). Files live in `public/images/<categoria>_placeholder.jpg`;
 * categories without a dedicated asset render the branded gradient tile.
 */
export const CATEGORY_PLACEHOLDERS: Record<PropertyCategory, string | null> = {
  APARTMENT: "/images/apartamento_placeholder.jpg",
  HOUSE: "/images/casa_placeholder.jpg",
  COMMERCIAL: "/images/salacomercial_placeholder.jpg",
  OFFICE: "/images/salacomercial_placeholder.jpg",
  LAND: null,
  FARM: null,
  GARAGE: null,
  OTHER: null,
};