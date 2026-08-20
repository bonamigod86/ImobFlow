/** Pure lead-routing heuristics (no I/O — unit-testable in isolation). */

export type RoutingTier = "hot" | "warm" | "cold";

/**
 * Initial routing tier based on acquisition channel. Converts a captured lead's
 * lead quality into a prioritization bucket consumed by the routing worker and
 * dashboards.
 */
export function routeTier(origin: string): RoutingTier {
  if (origin === "SOCIAL_MEDIA" || origin === "SITE_FORM") return "hot";
  if (origin === "PORTAL" || origin === "PHONE_CALL") return "warm";
  return "cold";
}