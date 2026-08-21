import { Prisma, type MediaStatus } from "@prisma/client";
import { prismaUnscoped } from "@/lib/prisma/client";
import type {
  PublicBroker,
  PublicCity,
  PublicListingFilters,
  PublicListingPage,
  PublicMedia,
  PublicProperty,
  PublicSort,
} from "@/lib/public/types";
import { slugify } from "@/lib/properties/seo";
import { resolveMediaUrl } from "@/lib/media/media-service";

/**
 * Public portal read-model.
 *
 * The portal is CROSS-tenant by design: it aggregates ACTIVE listings from every
 * ACTIVE tenant, so it MUST go through `prismaUnscoped` — the tenant-scoped
 * client is fail-closed and would throw (no ambient context on a public route).
 *
 * Visibility contract (enforced on EVERY query here):
 *   - property.status = 'ACTIVE'
 *   - property.isActive = true
 *   - tenant.status = 'ACTIVE'
 */

const VISIBLE: Prisma.PropertyWhereInput = {
  status: "ACTIVE",
  isActive: true,
  tenant: { status: "ACTIVE" },
};

const MEDIA_SELECT = {
  where: { status: "READY" as MediaStatus },
  orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }],
};

const DEFAULT_PAGE_SIZE = 12;

function mediaInclude(): Prisma.PropertyInclude {
  return { media: MEDIA_SELECT };
}

function whereFromFilters(f: PublicListingFilters): Prisma.PropertyWhereInput {
  const and: Prisma.PropertyWhereInput[] = [];
  const or: Prisma.PropertyWhereInput[] = [];

  if (f.target) and.push({ target: f.target });
  if (f.category) and.push({ category: f.category });
  if (f.neighborhood) and.push({ neighborhood: f.neighborhood });
  if (f.state) and.push({ state: f.state });
  if (f.featured) and.push({ isFeatured: true });
  if (f.furnished) and.push({ isFurnished: true });
  if (f.minBedrooms) and.push({ bedrooms: { gte: f.minBedrooms } });
  if (f.minSuites) and.push({ suites: { gte: f.minSuites } });
  if (f.minBathrooms) and.push({ bathrooms: { gte: f.minBathrooms } });
  if (f.minParking) and.push({ parkingSpots: { gte: f.minParking } });
  if (f.minArea) and.push({ area: { gte: f.minArea } });

  // City matching is slug-normalized: the route carries `sao-paulo`, so we match
  // the case-insensitive slugified city regardless of input case/accents.
  if (f.citySlug) {
    const matches = cityBySlugCache.get(f.citySlug);
    if (matches && matches.length > 0) {
      or.push({
        OR: matches.map((m) => ({
          city: { equals: m.city, mode: "insensitive" },
          ...(m.state ? { state: m.state } : {}),
        })),
      });
    } else {
      or.push({ city: { contains: f.citySlug, mode: "insensitive" } });
    }
  }

  // Text search: denormalized `searchText` haystack (see Phase 3 migration).
  if (f.q && f.q.trim()) {
    or.push({ searchText: { contains: f.q.trim(), mode: "insensitive" } });
  }

  // Prices are column-specific, so normalize which column(s) to range over.
  if (f.minPrice != null || f.maxPrice != null) {
    const range = {
      ...(f.minPrice != null ? { gte: new Prisma.Decimal(f.minPrice) } : {}),
      ...(f.maxPrice != null ? { lte: new Prisma.Decimal(f.maxPrice) } : {}),
    };
    if (f.target === "RENT") and.push({ rentPrice: range });
    else if (f.target === "SALE") and.push({ salePrice: range });
    else and.push({ OR: [{ salePrice: range }, { rentPrice: range }] });
  }

  const where: Prisma.PropertyWhereInput = { ...VISIBLE };
  if (and.length === 1) Object.assign(where, and[0]);
  else if (and.length > 1) where.AND = and;
  if (or.length > 0) {
    const orClause: Prisma.PropertyWhereInput[] = or.flatMap((o) => (o.OR ? o.OR : [o]));
    where.OR = orClause;
  }
  return where;
}

function sortArgs(sort: PublicSort): Prisma.PropertyOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" }];
    case "lowest_price":
      return [{ salePrice: "asc" }];
    case "highest_price":
      return [{ salePrice: "desc" }];
    case "largest_area":
      return [{ area: "desc" }];
    case "relevance":
    default:
      return [{ isFeatured: "desc" }, { createdAt: "desc" }];
  }
}

const LISTING_INCLUDE = (): Prisma.PropertyInclude => ({
  ...mediaInclude(),
  tenant: { select: { id: true, name: true, slug: true, logoUrl: true } },
});

/** City directory (grouped counts) used for the landing page + filter facets. */
export async function listCities(): Promise<PublicCity[]> {
  const rows = await prismaUnscoped.property.groupBy({
    by: ["city", "state"],
    where: VISIBLE,
    _count: { _all: true },
    orderBy: [{ city: "asc" }, { state: "asc" }],
  });
  return rows
    .filter((r) => r.city && r.city !== "—")
    .map((r) => ({
      city: r.city,
      state: r.state,
      slug: slugify(`${r.city}-${r.state}`),
      listingCount: r._count._all,
    }));
}

/** Single-page search: active listings with the multi-variable filters. */
export async function searchListings(
  filters: PublicListingFilters,
  opts: { page?: number; pageSize?: number; sort?: PublicSort } = {},
): Promise<PublicListingPage> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? DEFAULT_PAGE_SIZE;
  const sort = opts.sort ?? "relevance";
  const where = whereFromFilters(filters);

  const [items, total] = await prismaUnscoped.$transaction([
    prismaUnscoped.property.findMany({
      where,
      orderBy: sortArgs(sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: LISTING_INCLUDE(),
    }),
    prismaUnscoped.property.count({ where }),
  ]);
  const cities = await listCities();

  return {
    items: await resolveToPublic(items),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    filters,
    sort,
    cities,
  };
}

type ListingRow = Prisma.PropertyGetPayload<{
  include: ReturnType<typeof LISTING_INCLUDE>;
}>;

/** Fetch the visibility-qualified listing by public slug. */
export async function getListingBySlug(slug: string): Promise<ListingRow | null> {
  return prismaUnscoped.property.findFirst({
    where: { ...VISIBLE, slug },
    include: LISTING_INCLUDE(),
  });
}

/** Full PDP payload: `null` when invisible/unknown. */
export async function getPublicListing(slug: string): Promise<PublicProperty | null> {
  const row = await getListingBySlug(slug);
  if (!row) return null;
  const resolved = await resolveToPublic([row]);
  return resolved[0] ?? null;
}

/** Batch fetch of visible listings by id (favorites/results pages). */
export async function getPublicListingsByIds(ids: string[]): Promise<PublicProperty[]> {
  if (ids.length === 0) return [];
  const rows = await prismaUnscoped.property.findMany({
    where: { ...VISIBLE, id: { in: ids } },
    include: LISTING_INCLUDE(),
  });
  return resolveToPublic(rows);
}

/** Featured listings for the landing page. */
export async function listFeatured(listingCount = 6): Promise<PublicProperty[]> {
  const rows = await prismaUnscoped.property.findMany({
    where: { ...VISIBLE, isFeatured: true },
    orderBy: [{ createdAt: "desc" }],
    take: listingCount,
    include: LISTING_INCLUDE(),
  });
  return resolveToPublic(rows);
}

/** Latest listings for the landing page. */
export async function listLatest(listingCount = 6): Promise<PublicProperty[]> {
  const rows = await prismaUnscoped.property.findMany({
    where: VISIBLE,
    orderBy: [{ createdAt: "desc" }],
    take: listingCount,
    include: LISTING_INCLUDE(),
  });
  return resolveToPublic(rows);
}

/** Suggest similar listings for the PDP (same category, same city, not self). */
export async function listSimilar(slug: string, listingCount = 3): Promise<PublicProperty[]> {
  const current = await getListingBySlug(slug);
  if (!current) return [];
  const rows = await prismaUnscoped.property.findMany({
    where: {
      ...VISIBLE,
      id: { not: current.id },
      category: current.category,
      city: { equals: current.city, mode: "insensitive" },
    },
    orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
    take: listingCount,
    include: LISTING_INCLUDE(),
  });
  return resolveToPublic(rows);
}

/** Attributed broker for a tenant (first active owner/manager/agent). */
async function brokerFor(tenantId: string): Promise<PublicBroker | null> {
  const user = await prismaUnscoped.user.findFirst({
    where: { tenantId, isActive: true, role: { in: ["OWNER", "MANAGER", "AGENT"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, phone: true, photoUrl: true },
  });
  return user
    ? { id: user.id, name: user.name, email: user.email, phone: user.phone, photoUrl: user.photoUrl }
    : null;
}

function decimalString(v: Prisma.Decimal | null | undefined): string | null {
  return v == null ? null : v.toFixed(2);
}

async function resolveToPublic(rows: ListingRow[]): Promise<PublicProperty[]> {
  return Promise.all(
    rows.map(async (r) => {
      const publicMedia: PublicMedia[] = await Promise.all(
        r.media.map(async (m) => ({
          id: m.id,
          url: await resolveMediaUrl(m),
          kind: m.kind,
          sortOrder: m.sortOrder,
          isPrimary: m.isPrimary,
          width: m.width,
          height: m.height,
          mimeType: m.mimeType,
        })),
      );
      publicMedia.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
      const images = publicMedia.filter((m) => m.kind === "IMAGE");
      const videos = publicMedia.filter((m) => m.kind === "VIDEO");
      const coverImage = images.find((m) => m.isPrimary) ?? images[0] ?? null;
      return {
        id: r.id,
        slug: r.slug,
        tenantId: r.tenantId,
        tenantName: r.tenant.name,
        tenantSlug: r.tenant.slug,
        tenantLogoUrl: r.tenant.logoUrl ?? null,
        code: r.code,
        title: r.title,
        description: r.description,
        target: r.target,
        category: r.category,
        salePrice: decimalString(r.salePrice),
        rentPrice: decimalString(r.rentPrice),
        condoFee: decimalString(r.condoFee),
        propertyTax: decimalString(r.propertyTax),
        address: r.address,
        number: r.number,
        city: r.city,
        state: r.state,
        neighborhood: r.neighborhood,
        zipCode: r.zipCode,
        latitude: r.latitude != null ? String(r.latitude) : null,
        longitude: r.longitude != null ? String(r.longitude) : null,
        area: r.area != null ? String(r.area) : null,
        bedrooms: r.bedrooms,
        suites: r.suites,
        bathrooms: r.bathrooms,
        parkingSpots: r.parkingSpots,
        isFeatured: r.isFeatured,
        isFurnished: r.isFurnished,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        images: images,
        coverImage,
        videos,
        broker: await brokerFor(r.tenantId),
      };
    }),
  );
}

/** All visible slugs + updatedAt for the sitemap (bounded for safety). */
export async function listVisibleSlugs(limit = 50_000): Promise<Array<{ slug: string | null; updatedAt: Date }>> {
  return prismaUnscoped.property.findMany({
    where: VISIBLE,
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
}

/** Map a route `citySlug` back to the actual city/state rows. */
const cityBySlugCache = new Map<string, Array<{ city: string; state: string }>>();

export async function resolveCitySlug(citySlug: string): Promise<Array<{ city: string; state: string }>> {
  const cached = cityBySlugCache.get(citySlug);
  if (cached) return cached;
  const cities = await listCities();
  const matches = cities.filter((c) => c.slug === citySlug).map((c) => ({ city: c.city, state: c.state }));
  cityBySlugCache.set(citySlug, matches);
  return matches;
}