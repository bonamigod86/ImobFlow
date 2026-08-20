/**
 * Subdomain-based tenant resolution helpers.
 *
 * Pure functions (edge-safe) used by the Next.js middleware and by the server
 * side to map an incoming host header to a tenant slug.
 *
 * Resolution rules:
 *   1. If `APP_DOMAIN` is configured (e.g. "app.example.com"), the tenant slug
 *      is the leading label:  acme.app.example.com -> "acme".
 *   2. With no APP_DOMAIN (local dev on localhost) a bare first label such as
 *      "acme" is used when the host is NOT a reserved name (www/api/app/admin).
 *   3. In all other cases the caller must fall back to the `X-Tenant-Slug`
 *      header or the `tenant` query parameter.
 */

const IGNORED_LABELS = new Set(["www", "app", "api", "admin", "m"]);
const ROOT_HOSTS = new Set(["localhost", "127.0.0.1"]);

/** Extract a tenant slug from a raw `Host` header value. */
export function getTenantSlugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;

  // Strip port and normalize.
  const lower = host.split(":")[0]?.toLowerCase() ?? "";

  const appDomain = (process.env.APP_DOMAIN ?? "").toLowerCase().trim();

  if (appDomain) {
    if (lower === appDomain) return null; // bare root domain -> platform app
    if (lower.endsWith(`.${appDomain}`)) {
      const slug = lower.slice(0, -(appDomain.length + 1));
      return slug && !IGNORED_LABELS.has(slug) ? slug : null;
    }
    // Host not related to APP_DOMAIN -> do not guess.
    return null;
  }

  const labels = lower.split(".");
  if (labels.length <= 1) return null; // e.g. "localhost"

  const first = labels[0] ?? "";
  if (ROOT_HOSTS.has(lower) || IGNORED_LABELS.has(first)) return null;
  return first; // e.g. "acme.localhost" -> "acme"
}

/**
 * Normalize a tenant slug entered by humans / URL params into the canonical,
 * lower-case, kebab form used by the `Tenant.slug` column.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}