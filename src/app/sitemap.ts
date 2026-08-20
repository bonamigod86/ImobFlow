import type { MetadataRoute } from "next";
import { cityPaths, listingPaths, SITE_URL } from "@/lib/public/seo";
import { listCities, listVisibleSlugs } from "@/lib/public/repository";

export const dynamic = "force-dynamic";

/** Public portal sitemap — always fresh so new listings are crawlable ASAP. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, listings] = await Promise.all([listCities(), listVisibleSlugs()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/login` },
  ];

  return [
    ...staticRoutes,
    ...cityPaths(cities).map((c) => ({
      url: `${SITE_URL}${c.path}`,
      lastModified: new Date(),
      changeFrequency: c.changeFrequency,
      priority: c.priority,
    })),
    ...listingPaths(listings).map((l) => ({
      url: `${SITE_URL}${l.path}`,
      lastModified: l.lastModified ? new Date(l.lastModified) : new Date(),
      changeFrequency: l.changeFrequency,
      priority: l.priority,
    })),
  ] as MetadataRoute.Sitemap;
}