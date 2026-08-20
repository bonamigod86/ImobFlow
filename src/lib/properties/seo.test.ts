import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSearchText, ensureUniqueSlug, slugBaseFrom, slugify } from "@/lib/properties/seo";

beforeEach(() => {
  vi.resetModules();
});

describe("slugify", () => {
  it("lowercases and strips diacritics", () => {
    expect(slugify("São Paulo")).toBe("sao-paulo");
    expect(slugify("Copacabana JR")).toBe("copacabana-jr");
  });

  it("collapses separators and bounds the length", () => {
    const long = "A ".repeat(100);
    expect(slugify(long)).toHaveLength(80);
    expect(slugify("  --  ")).toBe("imovel");
  });

  it("falls back for empty/unsafe output", () => {
    expect(slugify("***")).toBe("imovel");
  });
});

describe("slugBaseFrom", () => {
  it("combines title, city and state", () => {
    expect(slugBaseFrom({ title: "Apartamento Copacabana", city: "Rio de Janeiro", state: "RJ" })).toBe(
      "apartamento-copacabana-rio-de-janeiro-rj",
    );
  });

  it('falls back on "imovel" when title is missing', () => {
    expect(slugBaseFrom({ city: "São Paulo", state: "SP" })).toBe("imovel-sao-paulo-sp");
  });
});

describe("ensureUniqueSlug", () => {
  it("returns the base when the slug is free", async () => {
    const { prismaUnscoped } = await import("@/lib/prisma/client");
    (vi.spyOn(prismaUnscoped.property, "findUnique") as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(ensureUniqueSlug("apartamento-teste")).resolves.toBe("apartamento-teste");
  });

  it("appends numeric suffixes to avoid collisions", async () => {
    const { prismaUnscoped } = await import("@/lib/prisma/client");
    (vi.spyOn(prismaUnscoped.property, "findUnique") as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where?: { slug?: string } }) =>
        where?.slug === "apartamento-teste" ? { id: "used" } : null,
    );
    await expect(ensureUniqueSlug("apartamento-teste")).resolves.toBe("apartamento-teste-2");
  });

  it("excludes the given id from the uniqueness check", async () => {
    const { prismaUnscoped } = await import("@/lib/prisma/client");
    (vi.spyOn(prismaUnscoped.property, "findUnique") as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where?: { slug?: string } }) =>
        where?.slug === "apartamento-teste" ? null : { id: "self" },
    );
    await expect(ensureUniqueSlug("apartamento-teste", "self")).resolves.toBe("apartamento-teste");
  });
});

describe("buildSearchText", () => {
  it("concatenates and lowercases the haystack", () => {
    expect(buildSearchText({ title: "Casa Jardins", code: "ACA-002", city: "São Paulo", state: "SP", neighborhood: "Jardins" })).toBe(
      "casa jardins aca-002 são paulo sp jardins",
    );
  });

  it("skips empty fields", () => {
    expect(buildSearchText({ title: "X", description: null, city: "Y" })).toBe("x y");
  });
});