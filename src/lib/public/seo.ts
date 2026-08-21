import type { Metadata } from "next";
import type { PublicCity, PublicProperty, PublicListingPage } from "@/lib/public/types";
import { CATEGORY_LABELS, TARGET_LABELS } from "@/lib/public/types";

/**
 * SEO engine — Next.js Metadata factory + Schema.org JSON-LD builders.
 *
 * Produces a consistent, crawlable metadata surface across the public portal:
 * unique title/description, canonical URL, Open Graph/Twitter cards, and
 * structured data (RealEstateListing + Place) for every PDP.
 */

export const SITE_NAME = "imobFlow";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://imob.example.com").replace(/\/$/, "");
export const LOCALE = "pt_BR";

function seoImageUrl(url: string): string {
  return url.startsWith("http") ? url : `${SITE_URL}${url}`;
}

interface SeoOptions {
  title: string;
  description: string;
  path: string;
  images?: string[];
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}

/** Base factory shared by every public route. */
export function buildMetadata(o: SeoOptions): Metadata {
  const canonical = `${SITE_URL}${o.path}`;
  const ogImage = (o.images ?? [])
    .filter(Boolean)
    .map((u) => seoImageUrl(u));

  return {
    title: o.title,
    description: o.description,
    alternates: { canonical },
    openGraph: {
      title: o.title,
      description: o.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: LOCALE,
      type: o.type ?? "website",
      ...(o.publishedTime ? { publishedTime: o.publishedTime } : {}),
      ...(o.modifiedTime ? { modifiedTime: o.modifiedTime } : {}),
      ...(ogImage.length > 0 ? { images: ogImage } : {}),
    },
    twitter: {
      card: ogImage.length > 0 ? "summary_large_image" : "summary",
      title: o.title,
      description: o.description,
      images: ogImage,
    },
  };
}

/** Landing page metadata. */
export function landingMetadata(latest: PublicProperty[], cityCount: number): Metadata {
  const featured = latest[0];
  const description =
    cityCount > 0
      ? `Encontre apartamentos, casas, terrenos e salas comerciais em ${cityCount}+ cidades. Imóveis à venda e para aluguel com atendimento de imobiliárias parceiras.`
      : "Encontre apartamentos, casas, terrenos e salas comerciais à venda e para aluguel. Imóveis verificados com atendimento de imobiliárias parceiras.";
  return buildMetadata({
    title: `${SITE_NAME} — Imóveis à venda e para aluguel`,
    description,
    path: "/",
    ...(featured?.coverImage?.url ? { images: [featured.coverImage.url] } : {}),
  });
}

/** Search-page metadata (dynamic per city/target/category + active filters). */
export function searchMetadata(
  page: PublicListingPage,
  cityLabel: string | null,
): Metadata {
  const t = page.filters.target ? TARGET_LABELS[page.filters.target] : null;
  const c = page.filters.category ? CATEGORY_LABELS[page.filters.category] : null;
  const bits = [cityLabel, t, c].filter(Boolean);
  const verb = page.filters.target === "RENT" ? "aluguel" : page.filters.target === "SALE" ? "venda" : "imóveis";

  const location = cityLabel ? ` em ${cityLabel}` : "";
  const base = `${bits.join(" ")}${location}`;
  const title = base ? `${base} | ${SITE_NAME}` : `${SITE_NAME} — Imóveis`;

  const descriptor = [c ?? "imóveis", location, t ? `para ${t.toLowerCase()}` : null].filter(Boolean).join(" ");
  const description =
    page.total > 0
      ? `${page.total} ${descriptor} disponíveis. ${bits.join(" ")} com fotos, plantas e contato direto com o anunciante.`
      : `Encontre ${descriptor} anunciados por imobiliárias parceiras. Filtre por preço, bairro, quartos e área.`;

  const firstImage = page.items[0]?.coverImage?.url;
  return buildMetadata({
    title,
    description,
    path: "/imoveis",
    ...(firstImage ? { images: [firstImage] } : {}),
  });
}

/** PDP metadata (unique per listing slug). */
export function listingMetadata(p: PublicProperty): Metadata {
  const dims = [
    p.bedrooms ? `${p.bedrooms} quartos` : null,
    p.suites ? `${p.suites} suítes` : null,
    p.bathrooms ? `${p.bathrooms} banheiros` : null,
    p.area ? `${p.area.replace(".", ",")} m²` : null,
    p.neighborhood ? p.neighborhood : null,
  ].filter(Boolean);

  const title = [p.title, p.city, p.state].filter(Boolean).join(" — ");
  const targetNote = p.target === "RENT" ? "para aluguel" : p.target === "SALE" ? "para venda" : "à venda e para aluguel";
  const priceNote =
    p.target === "RENT" && p.rentPrice
      ? `R$ ${Number(p.rentPrice).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}/mês`
      : p.salePrice
        ? `R$ ${Number(p.salePrice).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`
        : "";

  const descBits = [dims.slice(0, 4).join(", "), targetNote, priceNote].filter(Boolean);

  return buildMetadata({
    title,
    description: `${descBits.join(" · ")}. ${p.tenantName} — ${SITE_NAME}.`,
    path: `/imovel/${encodeURIComponent(p.slug ?? "")}`,
    type: "article",
    publishedTime: p.createdAt,
    modifiedTime: p.updatedAt,
    images: p.images.map((i) => i.url),
  });
}

/** Sitemap URL entries for the portal's static + dynamic routes. */
export interface SitemapEntry {
  path: string;
  lastModified?: string;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly";
  priority?: number;
}

export function cityPaths(cities: PublicCity[]): SitemapEntry[] {
  return cities.map((c) => ({
    path: `/imoveis/${c.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));
}

export function listingPaths(rows: Array<{ slug: string | null; updatedAt: Date }>): SitemapEntry[] {
  return rows
    .filter((r) => r.slug)
    .map((r) => ({
      path: `/imovel/${encodeURIComponent(r.slug!)}`,
      lastModified: r.updatedAt.toISOString(),
      changeFrequency: "monthly" as const,
      priority: 0.8,
    }));
}

/* ----------------------------- JSON-LD ------------------------------ */

export function listingJsonLd(p: PublicProperty): Record<string, unknown> {
  const streetAddress = [p.address, p.number].filter(Boolean).join(", ") || undefined;
  const price =
    p.target === "RENT" && p.rentPrice
      ? Number(p.rentPrice)
      : p.salePrice != null
        ? Number(p.salePrice)
        : null;

  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: p.title,
    description: p.description ?? `${p.title} — ${p.city}, ${p.state}.`,
    url: `${SITE_URL}/imovel/${encodeURIComponent(p.slug ?? "")}`,
    image: p.images.map((i) => i.url),
    datePosted: p.createdAt,
    dateModified: p.updatedAt,
    ...(price != null
      ? {
          offers: {
            "@type": "Offer",
            priceCurrency: "BRL",
            price,
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress,
      addressLocality: p.city,
      addressRegion: p.state,
      postalCode: p.zipCode ?? undefined,
      addressCountry: "BR",
    },
    geo:
      p.latitude && p.longitude
        ? {
            "@type": "GeoCoordinates",
            latitude: Number(p.latitude),
            longitude: Number(p.longitude),
          }
        : undefined,
    floorSize: p.area ? { "@type": "QuantitativeValue", value: Number(p.area), unitCode: "MTK" } : undefined,
    numberOfRooms: p.bedrooms ?? undefined,
    numberOfBathroomsTotal: p.bathrooms ?? undefined,
    numberOfParkingSpaces: p.parkingSpots ?? undefined,
    ...(p.broker
      ? {
          seller: {
            "@type": "RealEstateAgent",
            name: p.broker.name,
            email: p.broker.email,
          },
        }
      : {}),
  };
}

/** Breadcrumbs + Place list for search pages (rich nav / geo links). */
export function searchPageJsonLd(
  page: PublicListingPage,
  cityLabel: string | null,
): Record<string, unknown>[] {
  const crumbs: Array<{ "@type": string; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
  ];
  let position = 2;
  if (cityLabel) crumbs.push({ "@type": "ListItem", position: position++, name: cityLabel, item: `${SITE_URL}/imoveis` });
  if (page.filters.target) crumbs.push({ "@type": "ListItem", position: position++, name: TARGET_LABELS[page.filters.target], item: `${SITE_URL}/imoveis/${cityLabel ? "cidade" : ""}` });
  if (page.filters.category) crumbs.push({ "@type": "ListItem", position: position, name: CATEGORY_LABELS[page.filters.category], item: `${SITE_URL}/imoveis/${cityLabel ? "cidade" : ""}/${page.filters.target?.toLowerCase()}` });

  return [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs,
    },
  ];
}