import { Prisma, type PropertyStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { buildSearchText, ensureUniqueSlug, slugBaseFrom } from "@/lib/properties/seo";

/**
 * PropertyManagementService — Phase 2 engine operations.
 *
 * All functions run inside the ambient tenant context (withApiRoute), so the
 * tenant-extension auto-injects `tenantId` and every cross-tenant reference is
 * provably isolated. No handler in this module ever reads a tenantId from
 * input; ownership is enforced structurally by the Prisma extension.
 */

export interface PropertyActionResult {
  property: Prisma.PropertyGetPayload<{
    include: { media: { orderBy: { sortOrder: "asc" }; take: 1 } };
  }>;
  changed: string[];
}

/**
 * Derive the public identity fields (slug + searchText) for a new/updated
 * listing. `excludeId` lets updates skip uniqueness checks on their own slug.
 */
export async function withPublicIdentity(
  input: {
    title?: string | null;
    code?: string | null;
    city?: string | null;
    state?: string | null;
    neighborhood?: string | null;
    address?: string | null;
    description?: string | null;
    slug?: string | null;
  },
  excludeId?: string,
): Promise<{ slug: string | null; searchText: string }> {
  const slug = input.slug
    ? await ensureUniqueSlug(input.slug, excludeId)
    : await ensureUniqueSlug(slugBaseFrom(input), excludeId);
  return { slug, searchText: buildSearchText(input) };
}

/**
 * Duplicate a property. New listing gets a fresh `code` (based on the source
 * code + a short suffix to guarantee uniqueness) and a clean slate of flags.
 * Media rows are NOT copied — the gallery manager re-attaches assets.
 */
export async function duplicateProperty(id: string, overrides: { title?: string } = {}): Promise<PropertyActionResult> {
  const source = await prisma.property.findUnique({ where: { id } });
  if (!source) {
    throw new Prisma.PrismaClientKnownRequestError(`No Property found for the active tenant.`, {
      code: "P2025",
      clientVersion: (Prisma as unknown as { prismaVersion: { client: string } }).prismaVersion.client,
    });
  }

  const { id: _sourceId, createdAt: _createdAt, updatedAt: _updatedAt, slug: _oldSlug, isFeatured, isActive, ...base } = source;
  const newCode = await nextAvailableCode(source.tenantId, source.code);
  const title = overrides.title ?? `${source.title} (cópia)`;
  const publicIdentity = await withPublicIdentity({ ...source, title, code: newCode });

  const property = await prisma.property.create({
    data: {
      ...base,
      code: newCode,
      title,
      isFeatured: false,
      isActive: true,
      ...publicIdentity,
    },
    include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });

  return { property, changed: ["code", "isFeatured", "isActive", "slug", "searchText"] };
}

/** Persist a status transition (ACTIVE/INACTIVE/SOLD/RENTED). */
export async function setPropertyStatus(id: string, status: PropertyStatus): Promise<PropertyActionResult> {
  const property = await prisma.property.update({
    where: { id },
    data: { status },
    include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  return { property, changed: ["status"] };
}

/** Soft delete — flips `isActive`, keeping the row for analytics/recovery. */
export async function softDeleteProperty(id: string): Promise<PropertyActionResult> {
  const property = await prisma.property.update({
    where: { id },
    data: { isActive: false, status: "INACTIVE" },
    include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  return { property, changed: ["isActive", "status"] };
}

/** Restore a soft-deleted property. */
export async function restoreProperty(id: string): Promise<PropertyActionResult> {
  const property = await prisma.property.update({
    where: { id },
    data: { isActive: true },
    include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  return { property, changed: ["isActive"] };
}

/** Toggle the featured/spotlight flag. */
export async function setPropertyFeatured(id: string, featured: boolean): Promise<PropertyActionResult> {
  const property = await prisma.property.update({
    where: { id },
    data: { isFeatured: featured },
    include: { media: { orderBy: { sortOrder: "asc" }, take: 1 } },
  });
  return { property, changed: ["isFeatured"] };
}

/**
 * Generate the next free `code` for a duplicated listing: `CODE-01`, `CODE-02`, …
 * Scoped to the tenant so a concurrent import/ad option can't collide.
 */
async function nextAvailableCode(tenantId: string, baseCode: string): Promise<string> {
  const prefix = `${baseCode}-`;
  const existing = await prisma.property.findMany({
    where: { tenantId, code: { startsWith: prefix } },
    select: { code: true },
  });
  const taken = new Set(existing.map((p) => p.code));
  for (let i = 1; i <= 10_000; i++) {
    const candidate = `${prefix}${String(i).padStart(2, "0")}`;
    if (!taken.has(candidate)) return candidate;
  }
  const fallback = `${prefix}${Date.now()}`;
  return fallback;
}