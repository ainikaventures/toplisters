-- Registry of direct-pull ATS boards per employer
CREATE TABLE "employer_ats_sources" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "confidence" TEXT,
    "job_count" INTEGER NOT NULL DEFAULT 0,
    "last_fetched_at" TIMESTAMP(3),
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employer_ats_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employer_ats_sources_platform_slug_key" ON "employer_ats_sources"("platform", "slug");
CREATE INDEX "employer_ats_sources_platform_enabled_idx" ON "employer_ats_sources"("platform", "enabled");
