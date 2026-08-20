# SaaS Imob — Multi-Tenant Real Estate Platform

Production-grade foundation (**Phase 1: multi-tenancy, RBAC, async queues, audit logging**) plus the **Phase 2: Property Management Engine** (listing lifecycle, resilient media pipeline, batch import, dashboard analytics), **Phase 3: Public Portal, Search & SEO** and **Phase 5: Billing, Subscription Engine & Master Admin** on **Next.js 14 (App Router) + PostgreSQL + Prisma + Redis/BullMQ + Docker**.

> Strict data segregation is enforced at the ORM layer (fail-closed), not by
> developer discipline — cross-tenant leakage is impossible by construction.

---

## Stack

| Layer        | Technology                                            |
| ------------ | ----------------------------------------------------- |
| Framework    | Next.js 14 (App Router, TypeScript, strict mode)      |
| Database     | PostgreSQL 16 (row-level `tenant_id` segregation)     |
| ORM          | Prisma 5 + a tenant-enforcing client extension        |
| Cache/Queue  | Redis 7 + BullMQ (retries, backoff, DLQ)              |
| Auth/N      | Custom JWT (jose, HS256) + RBAC permission matrix      |
| Infra        | Docker Compose (postgres + redis + app + optional worker) |

---

## Directory map

```
├── docker-compose.yml              Postgres 16 + Redis 7 + Next dev + optional worker
├── Dockerfile / Dockerfile.dev     Production (multi-stage) & development images
├── prisma/
│   ├── schema.prisma               Full multi-tenant schema + composite indexes
│   ├── migrations/0_init/          Generated Phase 1 migration (Postgres SQL)
│   ├── migrations/..._property_management_engine/   Phase 2 migration
│   ├── migrations/..._public_portal_seo/            Phase 3 migration (slug/searchText/neighborhood)
│   └── seed.ts                     Idempotent demo data (plans, tenants, users)
└── src/
    ├── middleware.ts               Edge: subdomain tenant resolution + session gate
    ├── app/                        Routes (public portal, login/dashboard, properties, media, imports, analytics, API)
    ├── components/
    │   ├── portal/                 SiteHeader/Footer, PropertyCard, SearchFilters, Gallery,
    │   │                           ListingMap (Leaflet), ContactModal, Pagination
    │   └── LoginForm, DashboardView, SignOutButton
    ├── lib/
    │   ├── config/env.ts           Zod-validated environment singleton (incl. S3_*)
    │   ├── prisma/
    │   │   ├── client.ts           `prisma` (scoped) + `prismaUnscoped` (sanctioned)
    │   │   └── tenant-extension.ts FAIL-CLOSED tenantId injection at the ORM
    │   ├── public/                 Portal read-model (repository), SEO engine, types, formatting
    │   ├── tenant/                 context (AsyncLocalStorage), resolver, cache
    │   ├── rbac/                   action catalog + permission matrix + guards
    │   ├── auth/                   JWT (edge-safe), bcrypt, session helpers
    │   ├── audit/                  AuditService + typed audit actions
    │   ├── events/                 Typed domain event bus + audit subscribers
    │   ├── queues/                 names, job types, QueueManager, DeadLetterQueue
    │   ├── http/                   route-wrapper (auth+rbac+tenant), error mapper
    │   ├── properties/             property-service (duplicate/status/featured/soft-delete) + seo.ts (slug/searchText)
    │   ├── billing/                Phase 5: state-machine, webhook ingest, dunning, highlights,
    │   │                           metrics, plans, gateway adapters (+hmac verify), service/provision
    │   ├── media/                  image.ts (sharp), media-service.ts (gallery/upload)
    │   ├── storage/                S3-compatible adapter (R2/MinIO/AWS) + LocalStorage
    │   ├── imports/                parsers.ts (CSV/XML/JSON) + import-engine.ts
    │   ├── analytics/              dashboard.ts (status/utilization/engagement)
    │   └── validation/             Zod contracts for request boundaries
    ├── workers/                    BullMQ consumers (lead-routing, webhook, media, import, billing-sync, DLQ)
    └── types/                      Cross-cutting TS types
```

*Recap of Phase 1: multi-tenant foundation, RBAC, queues, audit.*
*Phase 2: Property Management Engine. Phase 3: Public Portal, Search & SEO.
Phase 5: Billing/Subscription Engine + Master Admin (see below).*

---

## Phase 3 — Public Portal, Search & SEO

An SSR public portal (ISR 60–300 s) that aggregates **ACTIVE listings from
every ACTIVE tenant**, with URL-driven search and structured data.

### 1. Schema & public identity

- `Property` gained `slug` (globally unique, indexable PDP URL), `neighborhood`
  and a denormalized `searchText` haystack. Migration:
  `prisma/migrations/20260819010000_public_portal_seo/`.
- `src/lib/properties/seo.ts` — `slugify`/`slugBaseFrom`/`ensureUniqueSlug`
  (cross-tenant uniqueness probe via `prismaUnscoped`) and `buildSearchText`.
- `property-service`, POST/PATCH routes and the import-engine regenerate
  slug/searchText on every write; imports preserve existing slugs (stable URLs).

### 2. Public read-model (`src/lib/public/repository.ts`)

- **`prismaUnscoped` is mandatory here** (the portal is cross-tenant); every
  query enforces `status = ACTIVE AND isActive = true AND tenant.status = ACTIVE`
- `searchListings()` — multi-variable filters (city slug, target, category,
  neighborhood, free-text `q`, price band, bedrooms/suites/baths/parking/area,
  featured, furnished) + sort + pagination.
- `listCities()` (city dir for landing + sitemap), `listFeatured/ListLatest`,
  `listSimilar()`, `getPublicListing(slug)`, `resolveCitySlug()`.
- Media rows are filtered to `IMAGE/READY` and resolved to public URLs.

### 3. Routes

| Route                                   | Purpose                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| `/`                                     | SSR landing — hero, featured, cities, latest, trust        |
| `/imoveis`                              | All listings (query filters on the URL)                    |
| `/imoveis/[city]/[target]/[category]`   | SEO search tiers, e.g. `/imoveis/sao-paulo-sp/venda/apartamento` |
| `/imoveis/[slug]`                        | PDP — gallery/lightbox, specs, Leaflet map, broker card, WhatsApp + schedule modal, similar |
| `/api/public/leads`                     | Public lead intake (cross-tenant, stamped to the property's tenant) |
| `/sitemap.xml` `robots.txt`             | Dynamic sitemap of city hubs + every visible listing       |

The portal shell (header/footer/cards) lives in `src/components/portal/`
(Tailwind, light theme) and is 100% React AwaL server-rendered; only the
gallery lightbox, map and contact modal are client components.

### 4. SEO engine (`src/lib/public/seo.ts`)

- `buildMetadata()` factory → unique title/description, canonical URL, Open
  Graph/Twitter (page-specific).
- Schema.org JSON-LD: `RealEstateListing` (Offer + GeoCoordinates + Place) on
  every PDP; `BreadcrumbList` on search pages; dynamic `sitemap.xml` of all city
  hubs + visible listing slugs.
- Robots disallows `/dashboard`, `/api/`, `/login`.

### 5. Tests (Phase 3)

- `src/lib/public/repository.test.ts` — visibility contract + filter wiring.
- `src/lib/public/seo.test.ts` — metadata + JSON-LD + BRL/area formatting.
- `src/lib/properties/seo.test.ts` — slugify/searchText/unique-slug behaviour.

---

## Phase 5 — Billing, Subscription Engine & Master Admin

Recurring subscription/payment engine (Stripe / Asaas / custom `CUSTOM`
gateways) with automated dunning, a highlight add-on economy and a MASTER-only
SaaS console. All real money values are **integer cents (BRL)** — never floats.

Migration: `prisma/migrations/20260820030000_billing_subscription_engine`.

### 1. Schema

- Enums: `BillingProvider`, `BillingCycle`, `BillingEventStatus`,
  `PaymentInvoiceStatus`, `BillingNotificationKind`, `HighlightPurchaseStatus`,
  `HighlightLedgerKind`, `HighlightSource`.
- `Plan` gained billing config (`billingCycle`, `maxProperties`, `maxUsers`,
  `maxLeads`, `highlightCredits`, `gracePeriodDays`, `trialDays`) plus the
  `planOverrides` tenant relation.
- New models: `TenantSubscription` (mirrors `TenantStatus`), `PaymentInvoice`,
  `BillingNotification` (unique `[tenantId,kind,dueDate]`), `HighlightPurchase`,
  `PropertyHighlight`, `HighlightCreditLedger` (append-only) and `BillingEvent`
  — the idempotency ledger with `@@unique([provider, providerEventId])`.

### 2. Webhook pipeline (`src/lib/billing/`)

- `gateway/verify.ts` — HMAC signature verification **over the exact raw body
  bytes** (never re-serialized); `gateway/index.ts` adapters (stripe/asaas/
  custom) with the `stripeCents()` minor-unit fix + `amountCents` convention.
- `billing-events.ts` — public ingress `POST /api/billing/webhooks`:
  signature → normalize → **idempotent ledger create** (`BillingEvent` unique
  key, duplicates acked) → dispatch to the state machine; FAILED → retryable.
- `state-machine.ts` — single authority over the subscription lifecycle
  (`handleCheckoutCompleted`, `handleInvoicePaid` with per-guard re-enablement
  + plan allotment, `handlePaymentFailed`, manual `manualBlockedAt` → 409).
- `dunning.ts` — `runGlobalBillingScan`: pre-due reminders, TRIAL→PAST_DUE at
  `trialEndsAt`, grace-expiry auto-suspension honoring `manualBlockedAt` and
  `BILLING_AUTOSUSPEND_ENABLED`, auto-reactivation on payment. Suspension only
  flips status — **never deletes tenant data/media**.
- `highlights.ts` — ledger-based credit system: plan allotment, TOPUP packs,
  `activateHighlight` (debits balance, upserts the feature window by property,
  priority boost), `expireDueHighlights`, purchases with `CUSTOM` checkout.
- `metrics.ts` — Master SaaS snapshot: **MRR/ARR (cents)**, period revenue,
  revenue-by-plan, churn rate, delinquency, highlight economics, conversion per
  `WebhookScope` and property health.
- `service.ts` / `plans.ts` — tenant provisioning (idempotent) + plan editor.
  `simulateProviderEvent` drives the real signed pipeline for dev/demo.

### 3. Automation

- `BILLING_SYNC` queue (concurrency 1): `src/workers/billing.worker.ts` runs
  the daily global billing scan at **02:00 America/Sao_Paulo**
  (`QueueManager.scheduleBillingDailyScan`) + highlight expiry. Platform-level
  jobs (no tenant context); failed → `billing-sync-dlq` with replay.

### 4. RBAC & API

- New permissions: `billing:self` (OWNER/MANAGER + MASTER) and `billing:admin`
  (**MASTER-only**).

| Method | Path | RBAC |
| ------ | ---- | ---- |
| POST   | `/api/billing/webhooks` | public (provider signature) |
| GET    | `/api/billing/subscription` | `billing:self` |
| GET/POST | `/api/billing/highlights` (balance / topup purchase) | `billing:self` |
| POST   | `/api/billing/highlights/activate` | `billing:self` |
| POST   | `/api/billing/highlights/purchases/[id]/pay` | `billing:self` |
| GET    | `/api/admin/billing/metrics`, `.../events`, `.../scan` | `billing:admin` |
| GET/PATCH | `/api/admin/billing/plans`, `.../plans/[code]`, `.../plans/[code]/status` | `billing:admin` |
| GET/POST | `/api/admin/billing/tenants/[id]`, `.../provision`, `.../simulate` | `billing:admin` |

### 5. UI

- `/dashboard/billing` (`src/components/billing/TenantBillingPanel.tsx`) —
  subscription status, invoices, notifications, highlight balance, activate
  highlight on a property, buy credit packs, simulated custom-gateway pay.
- `/admin/billing` (`src/components/admin/BillingAdminConsole.tsx`) — overview
  (metrics cards), plan editor, tenant drill-down with provision/simulate, and
  the webhook event ledger + manual scan trigger.

### 6. Env & tests

New env (see `.env.example`): `STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`,
`ASAAS_WEBHOOK_SECRET`, `ASAAS_API_KEY`, `ASAAS_API_URL`,
`CUSTOM_WEBHOOK_SECRET`, `BILLING_GRACE_DAYS`, `BILLING_PRE_DUE_NOTIFY_DAYS`,
`BILLING_AUTOSUSPEND_ENABLED` (all optional for dev — the verify step skips
signature checks when empty).

Tests: `verify.test.ts`, `billing-adapters.test.ts`, `billing-events.test.ts`
(idempotency), `dunning.test.ts`, `highlights.test.ts` + RBAC extensions
(`billing:admin` MASTER-only, `billing:self` tenant-scoped). The seed builds a
third demo tenant (`delta`, PAST_DUE) and acme's MRR/highlight economy through
the real pipeline.

---

## Phase 2 — Property Management Engine

Four work-streams shipped on top of the Phase 1 foundation:

### 1. Listing lifecycle (`/api/properties`)

- Full CRUD surface with **action runner** endpoints:
  `POST .../[id]/duplicate`, `PATCH .../[id]/status` (ACTIVE/INACTIVE/SOLD/
  RENTED + soft-delete/restore via `isActive`), `PATCH .../[id]/featured`.
- Enriched schema: `target` (SALE/RENT/BOTH), `category`, sale/rent/condo/Tax
  pricing, full address + geo, specs (area, bedrooms, suites, baths, parking),
  `isFeatured`/`isFurnished`, and `externalCode` for import dedupe.
- `src/lib/properties/property-service.ts` — engine operations, all tenant-
  scoped via the ambient Prisma extension.

### 2. Resilient media pipeline (`/api/properties/[id]/media`, gallery, worker)

- **Presigned upload** — client streams bytes directly to S3-compatible object
  storage (`src/lib/storage/storage.ts`; works with R2/MinIO/AWS, with an
  in-proc `LocalStorage` fallback for dev/tests).
- **Async processing** (`media-processing-queue`) — WebP transcode + 3 variants
  (thumbnail 400px, medium 900px, large 1400px), optional watermark composer
  (`src/lib/media/image.ts`, `@aws-sdk/s3-request-presigner`, `sharp`).
- **Gallery manager** — `PATCH /api/properties/[id]/gallery` (reorder + set
  primary cover atomically), `DELETE /api/media/[mediaId]` (removes the row and
  every stored object + variant).

### 3. Batch import engine (`/api/imports`, worker)

- **CSV / XML (VivaReal/ZAP-style) / JSON** parsing in pure, unit-tested
  parsers (`src/lib/imports/parsers.ts`) with tolerant field aliasing
  (pt-BR/common), BOM + quoted-CSV + BRL decimal handling.
- Custom import queue (`property-import-queue`) runs the async upsert loop with
  **per-row validation failures collected** (bounded error payload), **dedupe on
  `externalCode` (portals) falling back to `code`**, and batch counters
  (imported/updated/skipped/failed, status COMPLETED vs PARTIAL).

### 4. Subscriber dashboard analytics (`/api/analytics/dashboard`)

- `src/lib/analytics/dashboard.ts` aggregates within the active tenant:
  - **Listing state** (ACTIVE/INACTIVE/SOLD/RENTED counts)
  - **Plan utilization** — "45/100 properties", "2/5 user seats", "…/… leads"
    read from the tenant's plan `features` limits
  - **Engagement** — page views & lead counts over 7d/30d windows + conversion
    rates (views→leads), top properties by views (leads sourced from listings)
- Views are recorded via `POST /api/properties/[id]/view` into `PropertyView`.

### New queues

| Queue                        | Consumer                          | Retry policy |
| ---------------------------- | --------------------------------- | ------------ |
| `media-processing-queue`     | `workers/media-processing.worker.ts` | 5 × exponential; unreadable input → permanent (DLQ) |
| `property-import-queue`      | `workers/property-import.worker.ts` | 5 × exponential; batch-level retry |
| `lead-routing-queue`         | (Phase 1)                         | 5 × exponential |
| `webhook-transmission-queue` | (Phase 1)                         | 5 × exponential + 4xx permanent |
| `billing-sync-queue`         | `workers/billing.worker.ts`        | daily global dunning scan (02:00) |

---

## Phase 1 foundation (summary)

---

## Multi-tenancy model

Every tenant-owned row carries `tenant_id`:

```
Tenant 1───< User (tenantId nullable ONLY for MASTER platform admins)
    │───< Property     @@index([tenantId, id])  @@unique([tenantId, code])
    │───< Lead         @@index([tenantId, id])
    └───< AuditLog     @@index([tenantId, id], [tenantId, createdAt])
```

- Foreign keys use `ON DELETE CASCADE` (no orphan rows; tenant teardown is safe).
- All tenant-scoped tables carry a `(tenant_id, id)` composite index, matching
  the sharding/partitioning strategy used in later phases.
- Tenant resolution: **subdomain → slug** (`acme.app.saas.local`), with
  `X-Tenant-Slug` header / `?tenant=` query fallback for local development.

### How isolation is enforced (defense in depth)

1. **Edge middleware** (`src/middleware.ts`) resolves the subdomain, verifies the
   session JWT, and rejects a non-MASTER user whose tenant doesn't match.
2. **Route wrapper** (`src/lib/http/route-wrapper.ts`) re-verifies the cookie,
   checks RBAC, resolves the tenant from cache/DB and asserts it is ACTIVE.
3. **Prisma tenant-extension** (`src/lib/prisma/tenant-extension.ts`) injects
   `tenant_id` into every query automatically. **Fail-closed**: a query on
   `Property`/`Lead`/… without an ambient tenant context throws
   `TenantContextRequiredError` before touching PostgreSQL.
4. `runWithoutTenantScope()` is the only (explicit, audited) escape hatch for
   infrastructure code — never used by user-facing paths.

```ts
// Example: NO tenantId anywhere in the handler — the extension inserts it.
export const GET = withApiRoute(ACTIONS.PROPERTIES_READ, async (_ctx, req) => {
  const rows = await prisma.property.findMany({ where: { city: "SP" } });
  return ok({ rows }); // scoped to the active tenant automatically
});
```

## RBAC

Five roles with a **central permission matrix** (`src/lib/rbac/matrix.ts`):

| Role         | Scope                      | Highlights                                          |
| ------------ | -------------------------- | --------------------------------------------------- |
| `MASTER`     | Platform                   | Everything incl. `tenant:change-status`             |
| `OWNER`      | Tenant                     | All tenant actions                                  |
| `MANAGER`    | Tenant                     | Users (no delete), properties, leads, audit read    |
| `AGENT`      | Tenant                     | Properties read/update, leads CRUD, routing         |
| `RECEPTIONIST` | Tenant                  | Dashboard, read properties, capture/update leads    |

Guards: `hasPermission()`, `assertPermission()`, and `withApiRoute(action, …)`
which gates the route before any handler code runs.

## Queues & resilience (BullMQ)

Production queues with **exponential backoff (5 attempts, 2s base)** and a **DLQ**:

- `lead-routing-queue` — async lead enrichment (`src/workers/lead-routing.worker.ts`)
- `webhook-transmission-queue` — outbound integrations with timeout + retry
  classification (`429/5xx` retry, `4xx` permanent → DLQ immediately)
- `media-processing-queue` — WebP/thumbnail pipeline (Phase 2)
- `property-import-queue` — batch property imports (Phase 2)
- `billing-sync-queue` — daily global billing/dunning scan (Phase 5)

Every job carries `tenantId`; the worker opens that tenant context before any
DB access. Failed jobs are parked in `<queue>-dlq` and can be replayed via
`POST /api/jobs/[jobId]/replay` (audit-trailed).

## Audit logging

`AuditService` writes every critical event (login, property deletion, tenant
status change, integration/job failures) to `AuditLog` with automatically
resolved tenant/user/IP/user-agent context. Domain events
(`src/lib/events/event-bus.ts`) decouple producers from observers — audit
subscribers are wired once in `src/lib/events/register.ts`.

---

## Getting started

### Option A — Docker Compose (Postgres + Redis + app)

```bash
cp .env.example .env            # then edit JWT_SECRET
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npm run db:seed

# Open: http://localhost:3000
# Login (demo): owner@acme.com / ChangeMe-123!
# Subdomain dev (optional): add `127.0.0.1 acme.saas.local` to /etc/hosts
#                          then login at http://acme.saas.local:3000
```

### Option B — Local Node (no Docker)

```bash
npm install
cp .env.example .env            # point DATABASE_URL at a Postgres you own
npx prisma migrate dev
npm run db:seed
npm run dev                     # http://localhost:3000
npm run worker                  # separate terminal: queue consumers
```

### Verify

```bash
npm run typecheck   # tsc --noEmit
npm run test        # vitest (rbac, subdomain, jwt, tenant fail-closed)
npm run lint        # next lint
```

### Useful endpoints

| Method | Path                           | Auth / RBAC                |
| ------ | ------------------------------ | -------------------------- |
| POST   | `/api/auth/login`              | public                     |
| GET    | `/api/health`                  | public (db+redis probes)   |
| GET/POST | `/api/properties`            | `properties:read`/`create` |
| GET/PATCH/DELETE | `/api/properties/[id]`  | read / update / delete     |
| POST   | `/api/properties/[id]/duplicate` | `properties:create`    |
| PATCH  | `/api/properties/[id]/status`  | `properties:update`        |
| PATCH  | `/api/properties/[id]/featured`| `properties:update`        |
| POST   | `/api/properties/[id]/view`    | `properties:read` (records view) |
| POST   | `/api/properties/[id]/media`   | `properties:update` (presigned upload) |
| PATCH  | `/api/properties/[id]/gallery` | `properties:update` (reorder/primary) |
| DELETE | `/api/media/[mediaId]`         | `properties:update`        |
| POST   | `/api/imports?format=csv`      | `properties:create` (queues import job) |
| GET    | `/api/imports` / `/api/imports/[id]` | `properties:read`   |
| GET    | `/api/analytics/dashboard`     | `dashboard:read`           |
| GET/POST | `/api/leads`               | `leads:read`/`create` (+queues lead-routing job) |
| POST   | `/api/jobs/[jobId]`            | `leads:read` (tenant-scoped) |
| POST   | `/api/jobs/[jobId]/replay`     | `integrations:manage`      |
| PATCH  | `/api/admin/tenants/[id]`      | `tenant:change-status` (MASTER) |
| POST   | `/api/public/leads`            | public (portal lead intake, routed to listing's tenant) |
| POST   | `/api/billing/webhooks`        | public (provider signature → idempotent ingest) |
| GET    | `/api/billing/subscription`    | `billing:self` |
| GET/POST | `/api/billing/highlights`    | `billing:self` (balance / topup purchase) |
| POST   | `/api/billing/highlights/activate` | `billing:self` |
| POST   | `/api/billing/highlights/purchases/[id]/pay` | `billing:self` |
| GET    | `/api/admin/billing/metrics`, `.../scan`, `.../events` | `billing:admin` (MASTER) |
| GET/PATCH | `/api/admin/billing/plans`, `.../plans/[code]` | `billing:admin` |
| GET/POST | `/api/admin/billing/tenants/[id]`, `.../provision`, `.../simulate` | `billing:admin` |

---

## Public portal demo

```bash
npm run db:seed        # adds neighborhood/slug/searchText to demo listings
npm run dev
# Open http://localhost:3000            → landing
#      http://localhost:3000/imoveis    → all listings
#      http://localhost:3000/imoveis/sao-paulo-sp/venda/apartamento
#      PDP: click any card
```

`NEXT_PUBLIC_SITE_URL` (defaults to `https://imob.example.com`) drives
canonical URLs, sitemap, and JSON-LD. Public media needs `S3_PUBLIC_BASE_URL`
(or a CDN) and `next/image` remote patterns for `next/image` to optimize
portal galleries (see `next.config.mjs`).

---

## Security checklist (as implemented)

- [x] Tenant isolation enforced at ORM, route, and middleware layers (fail-closed)
- [x] HttpOnly + SameSite cookies; short-lived signed JWTs (HS256, `JWT_SECRET`
      validated ≥ 32 chars at startup)
- [x] bcrypt (cost 12, 72-byte bound) password hashing
- [x] RBAC matrix with role-scoped guards on every protected route
- [x] Tenant status gate (BLOCKED/CANCELLED rejected on each request)
- [x] Audit trail for privileged/security events with request context
- [x] Retry/backoff/DLQ for async jobs; idempotency via stable job IDs
- [x] Zod validation on every request boundary; no secrets in API responses
- [x] Production image runs as non-root user; Docker health checks wired

## Next phases (roadmap)

Phase 4 proposal already shipped as **Phase 5: billing/subscription engine,
tenant onboarding, dunning, highlight monetization and the Master admin
console**. Remaining roadmap: user management CRUD, integrations gateway
(CRMs, portals), scheduled PropertyPattern trend rollups, horizontal sharding
per tenant + event sourcing for audit.

---

## Phase 3 changelog

- Migration `20260819010000_public_portal_seo` — adds `neighborhood`, `slug`
  (unique index), `searchText`, city/neighborhood/searchText indexes + a
  Portuguese GIN `to_tsvector` index; backfills slugs for legacy rows.
- Dependencies added: `tailwindcss@^3.4.17`, `autoprefixer`, `postcss`,
  `lucide-react`, `@radix-ui/react-dialog`, `leaflet` + `@types/leaflet`.
  (`react-leaflet` intentionally omitted — v5 requires React 19; the portal
  uses plain Leaflet in a client component.)#   I m o b F l o w  
 