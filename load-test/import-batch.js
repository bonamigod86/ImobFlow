// import-batch.js — high-volume property import via POST /api/imports.
//
// Simulates a subscriber pushing a large CSV catalog. The route parses +
// validates synchronously, then the property-import queue drains asynchronously.
// We assert the batch is ACCEPTED (201) and that parsing never trips 500s.
//
// Auth: the import route is a tenant-authenticated endpoint. Pass the session
// cookie value (the raw JWT) and the tenant host.
//
// Usage:
//   k6 run -e K6_TENANT_DOMAIN=acme.localhost -e K6_BASE_URL=https://acme.localhost:3000 \
//     -e K6_SESSION_TOKEN=<jwt> load-test/import-batch.js
//
//   K6_ROWS_PER_BATCH   properties per CSV (default 250)

import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

const BASE = __ENV.K6_BASE_URL || "https://acme.localhost:3000";
const DOMAIN = __ENV.K6_TENANT_DOMAIN || "acme.localhost";
const TOKEN = __ENV.K6_SESSION_TOKEN || "";
const ROWS = __ENV.K6_ROWS_PER_BATCH ? Number(__ENV.K6_ROWS_PER_BATCH) : 250;

const serverErrors = new Rate("server_errors");

export const options = {
  stages: [
    { duration: "30s", target: 5 },
    { duration: "1m", target: 5 },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    server_errors: ["rate<0.02"],
    http_req_duration: ["p(95)<3000"],
  },
};

const HEADERS = {
  "content-type": "text/csv",
  host: DOMAIN,
  "x-requested-tenant-slug": DOMAIN.split(".")[0],
  cookie: __ENV.K6_COOKIE || (TOKEN ? `saas_session=${TOKEN}` : ""),
};

// Matches the CSV columns consumed by parseCsv in src/lib/imports/parsers.ts.
function buildCsv(rows) {
  const lines = ["code;title;city;state;neighborhood;target;salePrice;rentPrice;areaM2;bedrooms;bathrooms;parkingSpots;description"];
  for (let i = 0; i < rows; i++) {
    const n = `${__VU}-${__ITER}-${i}`;
    lines.push(
      `K6-${n};Apartamento ${n};Sao Paulo;SP;Moema;SALE;750000.00;;85;2;1;1;Imovel gerado em carga de importacao k6.`,
    );
  }
  return lines.join("\n");
}

export default function () {
  const res = http.post(`${BASE}/api/imports?format=csv&source=CSV&fileName=k6-batch.csv`, buildCsv(ROWS), {
    headers: HEADERS,
  });

  if (res.status >= 500) serverErrors.add(1);
  else check(res, { "import accepted": (r) => r.status === 201 || r.status === 200 });
}
