// public-portal.js — steady-state load over the public portal.
//
// Mix: 70% listing search (SSR), 20% property detail (PDP), 10% lead capture.
// Runs on the tenant subdomain (acme.localhost) so the middleware resolves
// the tenant slug from the Host header.
//
// Usage:
//   k6 run -e K6_TENANT_DOMAIN=acme.localhost -e K6_BASE_URL=https://acme.localhost:3000 \
//     load-test/public-portal.js
//
// Options:
//   K6_BASE_URL      base URL including the tenant subdomain (default https://acme.localhost:3000)
//   K6_TENANT_DOMAIN host header (default acme.localhost)
//   K6_VUS           virtual users (default 30)
//   K6_DURATION      run duration (default 3m)

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE = __ENV.K6_BASE_URL || "https://acme.localhost:3000";
const DOMAIN = __ENV.K6_TENANT_DOMAIN || "acme.localhost";

const errorRate = new Rate("http_errors");

export const options = {
  vus: __ENV.K6_VUS ? Number(__ENV.K6_VUS) : 30,
  duration: __ENV.K6_DURATION || "3m",
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_errors: ["rate<0.01"],
  },
};

const SLUGS = ["apto-copacabana-123", "casa-vila-madalena-045", "cobertura-moema-789"];
const LEAD_PAYLOAD = JSON.stringify({
  propertyId: "p1",
  name: "Visitante K6",
  email: "k6@example.com",
  phone: "+5511999990000",
  message: "Lead gerado por teste de carga.",
  schedule: null,
  utm: { source: "load-test", campaign: "k6" },
  consent: { textVersion: "2026-08-19.v1" },
});

const COMMON_HEADERS = {
  "content-type": "application/json",
  "x-requested-tenant-slug": DOMAIN.split(".")[0],
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function () {
  const roll = Math.random();
  const headers = { host: DOMAIN, ...COMMON_HEADERS };

  if (roll < 0.7) {
    // Search / listings with a couple of filter variants.
    const query = ["", "?target=SALE&city=Sao%20Paulo", "?type=APARTMENT"].sort(() => Math.random() - 0.5)[0];
    const res = http.get(`${BASE}/imoveis${query}`, { headers });
    check(res, { "search 200": (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
  } else if (roll < 0.9) {
    // Property detail page.
    const res = http.get(`${BASE}/imovel/${pick(SLUGS)}`, { headers });
    check(res, { "pdp 200": (r) => r.status === 200 });
    errorRate.add(res.status !== 200);
  } else {
    // Lead capture from the PDP form.
    const res = http.post(`${BASE}/api/public/leads`, LEAD_PAYLOAD, { headers });
    check(res, { "lead 2xx": (r) => r.status >= 200 && r.status < 300 });
    errorRate.add(res.status >= 300);
  }

  sleep(Math.random() * 0.8 + 0.2);
}
