import type { DashboardSnapshot } from "@/lib/analytics/dashboard";

/** A property row as returned by GET /api/properties (JSON-serialized). */
export interface PropertyRow {
  id: string;
  code: string;
  externalCode: string | null;
  title: string;
  description: string | null;
  target: "SALE" | "RENT" | "BOTH";
  category: string;
  status: "ACTIVE" | "INACTIVE" | "SOLD" | "RENTED";
  salePrice?: string | null;
  rentPrice?: string | null;
  condoFee?: string | null;
  propertyTax?: string | null;
  address?: string | null;
  number?: string | null;
  city: string;
  state: string;
  neighborhood?: string | null;
  zipCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  area?: string | null;
  bedrooms?: number | null;
  suites?: number | null;
  bathrooms?: number | null;
  parkingSpots?: number | null;
  isFurnished?: boolean | null;
  slug?: string | null;
  isActive: boolean;
  isFeatured: boolean;
  coverImage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A media row as returned by GET /api/properties/[id] (JSON-serialized). */
export interface PropertyMediaRow {
  id: string;
  propertyId: string;
  kind: "IMAGE" | "VIDEO";
  mimeType: string | null;
  objectKey: string | null;
  url: string | null;
  variants: Record<string, string> | null;
  isPrimary: boolean;
  sortOrder: number;
  status: "PENDING" | "PROCESSING" | "READY" | "FAILED";
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export type { DashboardSnapshot };

/** Top-property row enriched with the matching dashboard property row. */
export interface TopPropertyRow {
  id: string;
  code: string;
  title: string;
  views7d: number;
  leads7d: number;
  conversionRate: number;
  property?: PropertyRow;
}

export type PropertyStatus = PropertyRow["status"];

/** Property statuses grouped by count, used by the "Active Properties" card. */
export type StatusCounts = Record<PropertyStatus, number>;

/** Top-property display row already enriched with dashboard presentation data. */
export interface TopPropertyView {
  id: string;
  code: string;
  title: string;
  views7d: number;
  leads7d: number;
  leads30d: number;
  conversionRate: number;
  slug?: string | null;
  coverImage: string | null;
  category: string;
  priceLabel?: import("@/components/dashboard/format").PriceLabel;
}