-- First-party visitor analytics. Cookieless: visitor_hash rotates daily
-- (sha256 of IP + UA + day-bucket + PAGEVIEW_SALT, truncated). No PII at
-- rest, no consent banner required (legitimate-interest aggregated counts).
-- Spec amendment 2026-05-15: feeds /analytics/audience country dashboard.
CREATE TABLE "pageviews" (
    "id" BIGSERIAL PRIMARY KEY,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country_code" CHAR(2),
    "path" TEXT NOT NULL,
    "visitor_hash" CHAR(16) NOT NULL
);

CREATE INDEX "pageviews_occurred_at_idx" ON "pageviews"("occurred_at");
CREATE INDEX "pageviews_country_code_occurred_at_idx" ON "pageviews"("country_code", "occurred_at");
CREATE INDEX "pageviews_visitor_hash_idx" ON "pageviews"("visitor_hash");
