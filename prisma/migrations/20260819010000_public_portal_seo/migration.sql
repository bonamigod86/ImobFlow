-- Phase 3 — Public Portal & SEO
-- Adds neighborhood + public slug for indexable PDP URLs and portal search.
--
-- NOTE: slugs for pre-existing rows are backfilled by `npm run db:seed`
-- (idempotent) and by property-service on create/duplicate. The unique index
-- below guarantees URL stability once assigned.

-- AlterTable
ALTER TABLE "Property" ADD COLUMN "neighborhood" TEXT,
    ADD COLUMN "slug" TEXT,
    ADD COLUMN "searchText" TEXT;

-- Backfill searchText from the existing fields for rows created before this
-- migration (kept in sync by property-service/import-engine on future writes).
UPDATE "Property"
SET "searchText" = lower(coalesce("title", '') || ' ' || coalesce("code", '') ||
                          ' ' || coalesce("city", '') || ' ' || coalesce("state", '') ||
                          ' ' || coalesce("neighborhood", '') || ' ' || coalesce("address", ''));

-- Backfill a stable slug for any existing row that has a title, derived from
-- title + city + state, de-duplicated against already-assigned slugs.
-- Generated as: lower(unaccent-ish, ASCII) of "{title}-{city}-{state}", and a
-- numeric suffix appended until the global unique index is satisfied.
CREATE OR REPLACE FUNCTION __phase3_slugify(input TEXT) RETURNS TEXT AS $$
BEGIN
    RETURN lower(regexp_replace(regexp_replace(input, '[^a-zA-Z0-9\s]+', '-', 'g'), '[\s-]+', '-', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DO $$
DECLARE
    r RECORD;
    base TEXT;
    candidate TEXT;
    suffix INT;
    slug_taken BOOLEAN;
BEGIN
    FOR r IN SELECT id, title, city, state FROM "Property" WHERE "slug" IS NULL LOOP
        base := __phase3_slugify(COALESCE(r.title, 'imovel') || '-' || COALESCE(r.city, '') || '-' || COALESCE(r.state, ''));
        base := trim(BOTH '-' FROM base);
        IF base = '' THEN base := 'imovel'; END IF;
        suffix := 0;
        LOOP
            candidate := CASE WHEN suffix = 0 THEN base ELSE base || '-' || suffix::TEXT END;
            SELECT EXISTS(SELECT 1 FROM "Property" WHERE "slug" = candidate) INTO slug_taken;
            IF NOT slug_taken THEN
                UPDATE "Property" SET "slug" = candidate WHERE id = r.id;
                EXIT;
            END IF;
            suffix := suffix + 1;
            IF suffix > 100000 THEN
                candidate := base || '-' || replace(gen_random_uuid()::TEXT, '-', '')::TEXT;
                UPDATE "Property" SET "slug" = candidate WHERE id = r.id;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END $$;

DROP FUNCTION __phase3_slugify(TEXT);

-- CreateIndex
CREATE UNIQUE INDEX "Property_slug_key" ON "Property"("slug");

-- CreateIndex
CREATE INDEX "Property_city_state_neighborhood_idx" ON "Property"("city", "state", "neighborhood");

-- CreateIndex
CREATE INDEX "Property_neighborhood_idx" ON "Property"("neighborhood");

-- CreateIndex
CREATE INDEX "Property_searchText_idx" ON "Property"("searchText");

-- Full-text search support via PostgreSQL's native tsvector + GIN index,
-- normalized to Brazilian Portuguese. `searchText` is updated on write by the
-- application; the portal queries it through `contains` (ILIKE) — for very
-- large catalogs, queries can switch to `to_tsquery` using this index.
CREATE INDEX "Property_searchText_tsv_idx" ON "Property"
    USING GIN (to_tsvector('portuguese', "searchText"));