import { prismaUnscoped } from "@/lib/prisma/client";

/**
 * SEO helpers — global public identifiers for properties.
 *
 * `slug` is a GLOBALLY unique URL segment (the public portal is cross-tenant),
 * so uniqueness checks must go through `prismaUnscoped`, NOT the tenant-scoped
 * client (which can only see the ambient tenant and would false-positive on
 * other tenants' rows).
 */

/**
 * Default transliteration: strip diacritics, lowercase, keep [a-z0-9],
 * collapse whitespace/other chars to a single hyphen.
 */
const NORMALIZE = /[\u0300-\u036f]/g;
const ACCENTS: Record<string, string> = {
  á: "a", à: "a", â: "a", ã: "a", ä: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", õ: "o", ö: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ç: "c", ñ: "n",
};

export function slugify(input: string): string {
  const stripped = input
    .toLowerCase()
    .split("")
    .map((c) => ACCENTS[c] ?? c)
    .join("")
    .replace(NORMALIZE, "");
  const slug = stripped
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "imovel";
}

/** Suggested base slug from a property's salient fields. */
export function slugBaseFrom(input: {
  title?: string | null;
  city?: string | null;
  state?: string | null;
}): string {
  return slugify([input.title ?? "imovel", input.city, input.state].filter(Boolean).join("-"));
}

/**
 * Ensure a globally unique slug. Probes the DB (cross-tenant) and appends a
 * numeric suffix (`-2`, `-3`, …) until it finds a free segment.
 */
export async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const candidate = slugify(base);
  if (await slugIsFree(candidate, excludeId)) return candidate;
  for (let n = 2; n <= 100_000; n++) {
    const next = `${candidate}-${n}`;
    if (await slugIsFree(next, excludeId)) return next;
  }
  return `${candidate}-${Date.now().toString(36)}`;
}

export async function slugIsFree(slug: string, excludeId?: string): Promise<boolean> {
  const found = await prismaUnscoped.property.findUnique({
    where: { slug },
    select: { id: true },
  });
  return !found || (excludeId !== undefined && found.id === excludeId);
}

/** Denormalized search haystack (lowercased, all notable free-text fields). */
export function buildSearchText(input: {
  title?: string | null;
  code?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  description?: string | null;
}): string {
  return [input.title, input.code, input.city, input.state, input.neighborhood, input.address, input.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}