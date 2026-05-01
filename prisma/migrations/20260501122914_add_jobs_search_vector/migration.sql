-- Add a generated tsvector column to jobs for Postgres full-text search.
-- Weighting: A = title, B = company name, C = description.
-- Search will be issued via Prisma `$queryRaw` against this column.
ALTER TABLE "jobs"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("company_name", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description_text", '')), 'C')
  ) STORED;

CREATE INDEX "jobs_search_vector_idx" ON "jobs" USING GIN ("search_vector");
