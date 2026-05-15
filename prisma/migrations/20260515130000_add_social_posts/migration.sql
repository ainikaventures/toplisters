-- Audit log of every job auto-posted to a social platform. The
-- (job_id, platform) unique index doubles as the dedupe gate — the
-- runner queries "WHERE NOT EXISTS social_posts row" to pick candidates.
-- See lib/social/* for the platform adapters.
CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "external_id" TEXT,
    "external_url" TEXT,
    "error_message" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "social_posts_job_id_platform_key" ON "social_posts"("job_id", "platform");
CREATE INDEX "social_posts_platform_posted_at_idx" ON "social_posts"("platform", "posted_at");

ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
