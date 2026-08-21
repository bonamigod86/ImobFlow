import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/public/seo";
import { env } from "@/lib/config/env";

export const dynamic = "force-dynamic";

/**
 * Robots.txt — public portal crawling rules.
 * Homologação/staging (`APP_ENV !== "production"`) is kept out of search
 * indexes (`noindex` via `disallow: /`) so test data never leaks to SEO.
 */
export default function robots(): MetadataRoute.Robots {
  if (env.APP_ENV !== "production") {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/api/", "/login"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}