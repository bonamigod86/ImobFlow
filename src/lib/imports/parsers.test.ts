import { describe, expect, it } from "vitest";
import { parseCsv, parseJson, parseXml, splitCsvLine } from "@/lib/imports/parsers";

/**
 * Pure parser tests — no DB, no I/O. Covers the CSV / XML (VivaReal, ZAP) /
 * JSON contract the import engine feeds on.
 */

describe("splitCsvLine", () => {
  it("splits on commas and respects quoted fields", () => {
    expect(splitCsvLine('code,title,tags')).toEqual(["code", "title", "tags"]);
    expect(splitCsvLine('"ACA-001","Apartamento, long title","x"')).toEqual([
      "ACA-001",
      "Apartamento, long title",
      "x",
    ]);
    expect(splitCsvLine('"with ""quoted"" word",ok')).toEqual([
      'with "quoted" word',
      "ok",
    ]);
  });
});

describe("parseCsv", () => {
  it("parses a well-formed listing CSV", () => {
    const csv = [
      "code,city,uf,preco_venda,quartos,titulo",
      "C-100,Rio de Janeiro,RJ,750000,2,APT Copacabana",
      "C-101,São Paulo,SP,1200000,4,Casa Jardins",
      "",
    ].join("\n");

    const out = parseCsv(csv);
    expect(out.total).toBe(2);
    expect(out.valid).toBe(2);
    expect(out.rows[0]).toMatchObject({
      ok: true,
      data: {
        code: "C-100",
        city: "Rio de Janeiro",
        state: "RJ",
        salePrice: 750000,
        bedrooms: 2,
      },
    });
  });

  it("flags rows missing required city/state as invalid, keeps others", () => {
    const csv = ["code,city,uf", "C-1,Rio de Janeiro,RJ", "C-2,,SP", "C-3,São Paulo,"].join("\n");
    const out = parseCsv(csv);
    expect(out.total).toBe(3);
    expect(out.valid).toBe(1);
    expect(out.invalid).toBe(2);
    expect(out.rows[1]).toMatchObject({ ok: false, errors: expect.any(Array) });
  });

  it("handles BOM and decimal commas (BRL locale)", () => {
    const csv = [
      "\uFEFFcode,city,uf,preco_venda",
      "B-1,Belo Horizonte,MG,\"1.250.000,50\"",
    ].join("\n");
    const out = parseCsv(csv);
    expect(out.rows[0]?.data?.salePrice).toBe(1250000.5);
  });
});

describe("parseXml (VivaReal/ZAP style)", () => {
  const sample = `<?xml version="1.0"?>
<empreendimentos>
  <imovel>
    <codigoImovel>VR-2024-01</codigoImovel>
    <titulo>Apartamento no Jardins</titulo>
    <tipoImovel>APARTMENT</tipoImovel>
    <finalidade>SALE</finalidade>
    <preco_venda>980000</preco_venda>
    <logradouro>Av. Paulista, 1200</logradouro>
    <cidade>São Paulo</cidade>
    <uf>SP</uf>
    <quartos>3</quartos>
    <mobiliado>true</mobiliado>
  </imovel>
</empreendimentos>`;

  it("extracts nullable fields and normalizes enum values", () => {
    const out = parseXml(sample);
    expect(out.total).toBe(1);
    expect(out.valid).toBe(1);
    const data = out.rows[0]?.data;
    expect(data).toMatchObject({
      externalCode: "VR-2024-01",
      title: "Apartamento no Jardins",
      category: "APARTMENT",
      target: "SALE",
      salePrice: 980000,
      city: "São Paulo",
      state: "SP",
      bedrooms: 3,
      isFurnished: true,
    });
  });

  it("yields zero valid rows for empty XML", () => {
    expect(parseXml("<root></root>").total).toBe(0);
  });
});

describe("parseJson", () => {
  it("parses an array payload", () => {
    const out = parseJson(
      JSON.stringify([{ externalCode: "E1", city: "Curitiba", uf: "PR", rent: 3200 }]),
    );
    expect(out.total).toBe(1);
    expect(out.rows[0]?.data?.rentPrice).toBe(3200);
    expect(out.rows[0]?.data?.target).toBe("SALE");
  });

  it("parses an object with a listings array", () => {
    const out = parseJson(
      JSON.stringify({
        listings: [{ code: "L1", city: "Fortaleza", uf: "CE", finalidade: "RENT" }],
      }),
    );
    expect(out.rows[0]?.data?.target).toBe("RENT");
  });

  it("returns an invalid result on malformed JSON", () => {
    const out = parseJson("{ not json");
    expect(out.invalid).toBe(1);
    expect(out.valid).toBe(0);
  });
});

describe("image URL extraction", () => {
  it("splits string image lists into arrays", () => {
    const csv = ['code,city,uf,fotos', 'I-1,São Paulo,SP,"https://a.com/1.jpg,https://a.com/2.jpg"'].join("\n");
    const out = parseCsv(csv);
    expect(out.rows[0]?.data?.images).toEqual([
      "https://a.com/1.jpg",
      "https://a.com/2.jpg",
    ]);
  });
});