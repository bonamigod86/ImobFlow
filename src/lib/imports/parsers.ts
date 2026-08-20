/**
 * Property import parsers.
 *
 * Converts CSV / XML (VivaReal, ZAP) / JSON payloads into a normalized row
 * shape that the import engine upserts into the tenant's property collection.
 * Parsers are PURE — no I/O — so they are trivially unit-testable.
 *
 * A row is either a successful parse (`ok: true`, `data`) or an error
 * (`ok: false`, `errors`), so the engine can accumulate per-row failures
 * without aborting the whole batch.
 */

export interface NormalizedPropertyRow {
  externalCode?: string;
  code?: string;
  title?: string;
  description?: string;
  target?: "SALE" | "RENT" | "BOTH";
  category?: "APARTMENT" | "HOUSE" | "COMMERCIAL" | "LAND" | "FARM" | "OFFICE" | "GARAGE" | "OTHER";
  status?: "ACTIVE" | "INACTIVE" | "SOLD" | "RENTED";
  salePrice?: number | null;
  rentPrice?: number | null;
  condoFee?: number | null;
  propertyTax?: number | null;
  address?: string;
  number?: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  zipCode?: string;
  latitude?: number | null;
  longitude?: number | null;
  area?: number | null;
  bedrooms?: number;
  suites?: number;
  bathrooms?: number;
  parkingSpots?: number;
  isFeatured?: boolean;
  isFurnished?: boolean;
  /**
   * Image URLs captured from the payload. Kept as a normalized contract for a
   * future media-sync step (the import engine does not fetch/store media yet —
   * see media-service for the gallery pipeline).
   */
  images?: string[];
}

export interface ParsedRowResult {
  ok: boolean;
  index: number;
  data?: NormalizedPropertyRow;
  errors?: string[];
}

export interface ParseOutput {
  rows: ParsedRowResult[];
  total: number;
  valid: number;
  invalid: number;
}

const TARGETS = new Set(["SALE", "RENT", "BOTH"]);
const CATEGORIES = new Set(["APARTMENT", "HOUSE", "COMMERCIAL", "LAND", "FARM", "OFFICE", "GARAGE", "OTHER"]);
const STATUSES = new Set(["ACTIVE", "INACTIVE", "SOLD", "RENTED"]);

function pickEnum<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  const raw = typeof value === "string" ? value.toUpperCase() : "";
  return (allowed.has(raw) ? raw : fallback) as T;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toBool(value: unknown, fallback = false): boolean {
  if (value == null) return fallback;
  const raw = String(value).toLowerCase();
  return ["1", "true", "sim", "yes", "s", "disponivel", "yes"].includes(raw);
}

/** Shared normalization for a raw record (CSV headers or parsed XML element). */
function normalizeRaw(input: Record<string, unknown>, index: number): ParsedRowResult {
  const errors: string[] = [];
  const lowerMap = new Map<string, unknown>();
  for (const [k, v] of Object.entries(input)) {
    lowerMap.set(k.toLowerCase(), v);
  }
  const get = (keys: string[]): unknown => {
    for (const k of keys) {
      const direct = input[k];
      if (direct !== undefined && direct !== null && direct !== "") return direct;
      // Case-insensitive fallback (XML parser lowercases tag names).
      const folded = lowerMap.get(k.toLowerCase());
      if (folded !== undefined && folded !== null && folded !== "") return folded;
    }
    return undefined;
  };

  const city = get(["city", "cidade", "cidade/uf"]);
  const state = get(["state", "uf", "estado"]);
  const code = get(["code", "referencia", "reference", "codigo", "código"]);
  const externalCode = get(["externalCode", "cod_externo", "externoId", "external_id", "idImovel", "codigoImovel"]);

  if (!city || !state) {
    errors.push("city (or 'cidade') and state (or 'uf') are required.");
  }
  if (!code && !externalCode) {
    errors.push("code or externalCode is required (drives dedup).");
  }
  if (errors.length) {
    return { ok: false, index, errors };
  }

  const target = pickEnum<"SALE" | "RENT" | "BOTH">(get(["target", "finalidade", "operacao", "business"]), TARGETS, "SALE");
  const category = pickEnum<"APARTMENT" | "HOUSE" | "COMMERCIAL" | "LAND" | "FARM" | "OFFICE" | "GARAGE" | "OTHER">(
    get(["category", "tipo", "tipoImovel", "kind"]),
    CATEGORIES,
    "OTHER",
  );
  const status = pickEnum<"ACTIVE" | "INACTIVE" | "SOLD" | "RENTED">(
    get(["status", "situacao", "listingStatus"]),
    STATUSES,
    "ACTIVE",
  );

  const salePrice = toNumber(get(["salePrice", "valorVenda", "preco_venda", "sale_price", "price"]));
  const rentPrice = toNumber(get(["rentPrice", "valorAluguel", "preco_aluguel", "rent_price", "rent"]));
  const condoFee = toNumber(get(["condoFee", "condominio", "condo_fee"]));
  const propertyTax = toNumber(get(["propertyTax", "iptu", "property_tax"]));

  const row: NormalizedPropertyRow = {
    externalCode: externalCode != null ? String(externalCode) : undefined,
    code: code != null ? String(code) : undefined,
    title: stringOr(get(["title", "titulo", "nome", "logradouro"])),
    description: stringOr(get(["description", "descricao", "descricao_completa"])),
    target,
    category,
    status,
    salePrice,
    rentPrice,
    condoFee,
    propertyTax,
    address: stringOr(get(["address", "endereco", "rua", "logradouro"])),
    number: stringOr(get(["number", "numero"])),
    city: String(city),
    state: String(state).toUpperCase().slice(0, 2),
    neighborhood: stringOr(get(["neighborhood", "bairro"])),
    zipCode: stringOr(get(["zipCode", "cep"])),
    latitude: toNumber(get(["latitude", "lat"])),
    longitude: toNumber(get(["longitude", "lng", "lon"])),
    area: toNumber(get(["area", "areaM2", "area_m2", "aream2", "areautil", "area_util", "areaUtil"])),
    bedrooms: toInt(get(["bedrooms", "quartos", "dormitorios"])),
    suites: toInt(get(["suites", "suite_completa"])),
    bathrooms: toInt(get(["bathrooms", "banheiros", "vagas_garagem"])),
    parkingSpots: toInt(get(["parkingSpots", "vagas", "garagem"])),
    isFeatured: toBool(get(["isFeatured", "destaque", "principal"])),
    isFurnished: toBool(get(["isFurnished", "mobiliado"])),
  };

  // Title fallback from address when the file omits it.
  if (!row.title) {
    row.title = `${row.category ?? "Imóvel"} — ${row.city}, ${row.state}`;
  }

  const imagesRaw = get(["images", "fotos", "imagens", "media"]);
  if (typeof imagesRaw === "string") {
    row.images = imagesRaw
      .split(/[;,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (Array.isArray(imagesRaw)) {
    row.images = imagesRaw.map(String);
  }

  return { ok: true, index, data: row };
}

function stringOr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function toInt(v: unknown): number | undefined {
  const n = v == null ? NaN : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : undefined;
}

/** Parse a CSV string. First row = headers; semi-tolerant to \r\n and BOM. */
export function parseCsv(input: string): ParseOutput {
  const lines = input
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const rows: ParsedRowResult[] = [];
  if (lines.length === 0) return { rows, total: 0, valid: 0, invalid: 0 };

  const headers = splitCsvLine(lines[0]!);
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]!);
    if (values.length === 1 && values[0] === "") continue;
    const record: Record<string, unknown> = {};
    headers.forEach((h, idx) => (record[h] = values[idx] ?? ""));
    rows.push(normalizeRaw(record, i));
  }

  return summarize(rows);
}

/** Simple CSV line splitter with quoted-field support. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

/**
 * Parse a real-estate portal XML (VivaReal/ZAP style). Extremely tolerant:
 * looks for `imovel` (pt) / `listing` / `property` element wrappers and maps
 * child tags positionally via normalizeRaw.
 */
export function parseXml(input: string): ParseOutput {
  const rows: ParsedRowResult[] = [];
  const records = extractXmlRecords(input);

  records.forEach((record, idx) => rows.push(normalizeRaw(record, idx)));
  return summarize(rows);
}

export function extractXmlRecords(xml: string): Array<Record<string, string>> {
  const records: Array<Record<string, string>> = [];
  // Split on any of the common record wrappers.
  const wrapperRe = /<\s*(?:imovel|listing|property)\s*>/gi;
  const parts = xml.split(wrapperRe).slice(1);

  for (const part of parts) {
    const closeIdx = part.search(/<\s*\/\s*(?:imovel|listing|property)\s*>/i);
    const body = closeIdx === -1 ? part : part.slice(0, closeIdx);
    const record: Record<string, string> = {};
    const tagRe = /<\s*([a-zA-Z0-9_:-]+)\s*>([\s\S]*?)<\s*\/\s*\1\s*>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(body)) !== null) {
      const tag = m[1]!.toLowerCase();
      record[tag] = m[2]!.trim();
    }
    if (Object.keys(record).length) records.push(record);
  }
  return records;
}

/** Parse a JSON payload: array of listings or an object with a `listings` key. */
export function parseJson(input: string): ParseOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { rows: [], total: 1, valid: 0, invalid: 1 };
  }

  const arr: unknown[] =
    Array.isArray(parsed) ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { listings?: unknown[] }).listings)
      ? (parsed as { listings: unknown[] }).listings
      : [];

  const rows: ParsedRowResult[] = arr.map((item, i) =>
    normalizeRaw(typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {}, i),
  );
  return summarize(rows);
}

function summarize(rows: ParsedRowResult[]): ParseOutput {
  const valid = rows.filter((r) => r.ok).length;
  const invalid = rows.length - valid;
  return { rows, total: rows.length, valid, invalid };
}