import { describe, expect, it } from "vitest";
import { listingMetadata, listingJsonLd } from "@/lib/public/seo";
import { formatBRL, priceFor, locationLabel } from "@/lib/public/format";
import type { PublicProperty } from "@/lib/public/types";

const property: PublicProperty = {
  id: "p1",
  slug: "apartamento-copacabana-rio-de-janeiro-rj",
  tenantId: "t1",
  tenantName: "ACME Imóveis",
  tenantSlug: "acme",
  code: "ACA-001",
  title: "Apartamento Copacabana",
  description: "Vista parcial para o mar.",
  target: "SALE",
  category: "APARTMENT",
  salePrice: "750000.00",
  rentPrice: null,
  condoFee: null,
  propertyTax: null,
  address: "Av. Atlântica 1000",
  number: "1000",
  city: "Rio de Janeiro",
  state: "RJ",
  neighborhood: "Copacabana",
  zipCode: "22010-010",
  latitude: "-22.9711111",
  longitude: "-43.1822222",
  area: "68",
  bedrooms: 2,
  suites: 1,
  bathrooms: 2,
  parkingSpots: 1,
  isFeatured: true,
  isFurnished: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  images: [],
  coverImage: null,
  videos: [],
  broker: { id: "u1", name: "Agente ACME", email: "agent@acme.com", phone: null },
};

describe("format", () => {
  it("formats BRL from decimal string", () => {
    expect(formatBRL("750000.00")).toBe("R$ 750.000");
    expect(formatBRL("1250000.00", { compact: true })).toBe("R$ 1,3 mi");
  });

  it("returns empty for missing values", () => {
    expect(formatBRL(null)).toBe("");
    expect(formatBRL(undefined)).toBe("");
  });

  it("picks the correct price column per target", () => {
    expect(priceFor(property).label).toBe("R$ 750.000");
    const rent: PublicProperty = { ...property, target: "RENT", rentPrice: "4200.00", salePrice: null };
    expect(priceFor(rent)).toMatchObject({ label: "R$ 4.200", period: "/mês" });
  });

  it("builds location labels", () => {
    expect(locationLabel(property)).toBe("Rio de Janeiro, RJ");
    expect(locationLabel(property, { withNeighborhood: true })).toBe("Copacabana, Rio de Janeiro, RJ");
  });
});

describe("listingMetadata", () => {
  it("produces a canonical, unique title/description", () => {
    const md = listingMetadata(property);
    expect(md.title).toContain("Apartamento Copacabana");
    expect(md.description).toContain("para venda");
    expect(md.alternates?.canonical).toBe(
      "https://imob.example.com/imovel/apartamento-copacabana-rio-de-janeiro-rj",
    );
  });
});

describe("listingJsonLd", () => {
  it("emits a RealEstateListing with offer + geo + seller", () => {
    const ld = listingJsonLd(property);
    expect(ld["@type"]).toBe("RealEstateListing");
    const offers = ld.offers as { priceCurrency: string; price: number };
    expect(offers.priceCurrency).toBe("BRL");
    expect(offers.price).toBe(750000);
    const geo = ld.geo as { latitude: number; longitude: number };
    expect(geo.latitude).toBeCloseTo(-22.9711111, 4);
    expect((ld.seller as { "@type": string; name: string }).name).toBe("Agente ACME");
  });

  it("emits rent price when target is RENT", () => {
    const rent: PublicProperty = { ...property, target: "RENT", rentPrice: "4200.00", salePrice: null };
    const ld = listingJsonLd(rent);
    expect((ld.offers as { price: number }).price).toBe(4200);
  });
});