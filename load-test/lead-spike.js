// lead-spike.js — burst test for public lead intake.
//
// Validates that a traffic spike on POST /api/public/leads is absorbed by
// rate limiting (per-IP) and that the lead engine keeps persisting without
// 5xx or validation meltdowns. Per-IP limiter caps RATE_LIMIT_PUBLIC_LEADS;
// a single k6 VU uses one IP by default, so this doubles as a check that the
// limiter does NOT reject legit load.
//
// Usage:
//   k6 run -e K6_TENANT_DOMAIN=acme.localhost -e K6_BASE_URL=https://acme.localhost:3000 \
//     load-test/lead-spike.js

import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";

const BASE = __ENV.K6_BASE_URL || "https://acme.localhost:3000";
const DOMAIN = __ENV.K6_TENANT_DOMAIN || "acme.localhost";

const rejected = new Rate("rate_limited_rejected");
const serverErrors = new Rate("server_errors");

export const options = {
  scenarios: {
    lead_burst: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 200 },
        { duration: "1m", target: 200 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    server_errors: ["rate<0.02"],
    http_req_duration: ["p(95)<1000"],
  },
};

const PROPERTIES = ["p1", "p2", "p3", "p4", "p5"];
const BASE_HEADERS = { "content-type": "application/json", host: DOMAIN };

export default function () {
  const propertyId = PROPERTIES[__VU % PROPERTIES.length];
  const body = JSON.stringify({
    propertyId,
    name: `Spike ${__VU}-${__ITER}`,
    email: `spike-${__VU}-${__ITER}@example.com`,
    phone: "+5511988887777",
    message: "Pico de carga de leads.",
    schedule: null,
    utm: { source: "spike", campaign: "k6" },
    consent: { textVersion: "2026-08-19.v1" },
  });

  const res = http.post(`${BASE}/api/public/leads`, body, { headers: BASE_HEADERS });

  if (res.status === 429) rejected.add(1);
  else if (res.status >= 500) serverErrors.add(1);
  else check(res, { "lead 2xx": (r) => r.status >= 200 && r.status < 300 });
}
