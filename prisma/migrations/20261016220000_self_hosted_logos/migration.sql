-- Self-hosted logos (Logo.dev self-hosting flow; see lib/logos/store.ts)
CREATE TABLE "stored_logos" (
    "domain" TEXT NOT NULL,
    "content_type" TEXT,
    "bytes" BYTEA,
    "etag" TEXT,
    "fetched_at" TIMESTAMP(3),
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_logos_pkey" PRIMARY KEY ("domain")
);

-- Repoint existing Logo.dev CDN URLs (img.logo.dev/<domain>?token=…) at our
-- own /logos/<domain> route. URL rewrite only — no downloads here; each logo
-- is fetched once via the API the first time it's requested.
UPDATE "company_logos"
SET "logo_url" = regexp_replace("logo_url", '^https://img\.logo\.dev/([^?/]+).*$', 'https://toplisters.xyz/logos/\1')
WHERE "logo_url" LIKE 'https://img.logo.dev/%';

UPDATE "companies"
SET "logo_url" = regexp_replace("logo_url", '^https://img\.logo\.dev/([^?/]+).*$', 'https://toplisters.xyz/logos/\1')
WHERE "logo_url" LIKE 'https://img.logo.dev/%';

UPDATE "jobs"
SET "company_logo_url" = regexp_replace("company_logo_url", '^https://img\.logo\.dev/([^?/]+).*$', 'https://toplisters.xyz/logos/\1')
WHERE "company_logo_url" LIKE 'https://img.logo.dev/%';
