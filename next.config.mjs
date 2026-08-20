/** @type {import('next').NextConfig} */

/**
 * Security headers (Phase 6 hardening).
 *
 * - CSP: pragmatic policy — Next.js runtime injects inline bootstrap scripts
 *   and Tailwind style elements, so `'unsafe-inline'` is scoped to
 *   script/style; everything else is locked to 'self' + the media CDN.
 * - HSTS is only advertised when the app is served over HTTPS (APP_URL https).
 * - CORS: only `/api/public/*` may be consumed cross-origin, and only from the
 *   origins explicitly configured in `CORS_ORIGINS` (comma-separated). All
 *   authenticated routes stay same-origin (httpOnly + SameSite=Lax cookie).
 */

const allowPublicApiOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const isHttps = (process.env.APP_URL ?? "").startsWith("https://");

// Next.js dev tooling (React Fast Refresh) evaluates module code via eval();
// production builds never need it. Keep 'unsafe-eval' out of deployed CSPs.
const isDev = process.env.NODE_ENV === "development";
const scriptSources = ["'self'", "'unsafe-inline'", "blob:", ...(isDev ? ["'unsafe-eval'"] : [])];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  experimental: {
    // Keep request bodies bounded; route handlers validate payloads with zod.
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    // All imagery in production should come from tenant-managed CDN origins.
    // Add your CDN host here (e.g. cdn.mydomain.com) so `next/image` can
    // optimize the public portal galleries without falling back to unoptimized.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.tenant-media.example.com" },
    ],
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value:
          "default-src 'self'; " +
          `script-src ${scriptSources.join(" ")}; ` +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: https:; " +
          "font-src 'self' data:; " +
          "connect-src 'self' https://*.tile.openstreetmap.org; " +
          "frame-ancestors 'none'; " +
          "base-uri 'self'; " +
          "form-action 'self'; " +
          "object-src 'none'",
      },
    ];
    if (isHttps) {
      common.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    const corsHeaders = allowPublicApiOrigins.map((origin) => ({
      key: "Access-Control-Allow-Origin",
      value: origin,
    }));

    return [
      { source: "/(.*)", headers: common },
      {
        // Public portal intake is intentionally cross-origin (partner sites).
        source: "/api/public/:path*",
        headers: [
          ...corsHeaders,
          { key: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, X-Tenant-Slug" },
          { key: "Access-Control-Max-Age", value: "600" },
        ],
      },
    ];
  },
};

export default nextConfig;