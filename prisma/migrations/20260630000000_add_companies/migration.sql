-- Company directory aggregated from jobs
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "company_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "domain" TEXT,
    "logo_url" TEXT,
    "job_count" INTEGER NOT NULL DEFAULT 0,
    "country_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "has_direct" BOOLEAN NOT NULL DEFAULT false,
    "visa_friendly" BOOLEAN NOT NULL DEFAULT false,
    "last_job_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");
CREATE INDEX "companies_job_count_idx" ON "companies"("job_count" DESC);
CREATE INDEX "companies_normalized_name_idx" ON "companies"("normalized_name");
