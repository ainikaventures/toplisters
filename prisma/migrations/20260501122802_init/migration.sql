-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('full_time', 'part_time', 'contract', 'temp', 'internship');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('remote', 'hybrid', 'onsite', 'unknown');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('entry', 'mid', 'senior', 'exec', 'unknown');

-- CreateEnum
CREATE TYPE "CollarType" AS ENUM ('blue', 'white', 'grey', 'unknown');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('hourly', 'daily', 'monthly', 'yearly');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('approved', 'pending', 'rejected');

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_domain" TEXT,
    "location_text" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "apply_url" TEXT NOT NULL,
    "description_html" TEXT NOT NULL,
    "description_text" TEXT NOT NULL,
    "posted_date" TIMESTAMP(3) NOT NULL,
    "closing_date" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "salary_currency" CHAR(3),
    "salary_period" "SalaryPeriod",
    "job_type" "JobType" NOT NULL,
    "work_mode" "WorkMode" NOT NULL DEFAULT 'unknown',
    "experience_level" "ExperienceLevel" NOT NULL DEFAULT 'unknown',
    "category" TEXT NOT NULL,
    "collar_type" "CollarType" NOT NULL DEFAULT 'unknown',
    "skills" TEXT[],
    "benefits" TEXT[],
    "visa_sponsorship" BOOLEAN,
    "is_user_submitted" BOOLEAN NOT NULL DEFAULT false,
    "submitted_by_email" TEXT,
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'approved',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "dedupe_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_clicks" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "referer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" SERIAL NOT NULL,
    "geoname_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "ascii_name" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "admin1_code" TEXT,
    "admin2_code" TEXT,
    "population" INTEGER NOT NULL DEFAULT 0,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geocode_cache" (
    "id" SERIAL NOT NULL,
    "raw_location" TEXT NOT NULL,
    "country_code" CHAR(2),
    "region" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_dedupe_hash_key" ON "jobs"("dedupe_hash");

-- CreateIndex
CREATE INDEX "jobs_country_code_is_active_idx" ON "jobs"("country_code", "is_active");

-- CreateIndex
CREATE INDEX "jobs_country_code_city_is_active_idx" ON "jobs"("country_code", "city", "is_active");

-- CreateIndex
CREATE INDEX "jobs_category_is_active_idx" ON "jobs"("category", "is_active");

-- CreateIndex
CREATE INDEX "jobs_is_active_posted_date_idx" ON "jobs"("is_active", "posted_date" DESC);

-- CreateIndex
CREATE INDEX "jobs_is_featured_posted_date_idx" ON "jobs"("is_featured" DESC, "posted_date" DESC);

-- CreateIndex
CREATE INDEX "jobs_last_seen_at_idx" ON "jobs"("last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_source_source_id_key" ON "jobs"("source", "source_id");

-- CreateIndex
CREATE INDEX "job_clicks_job_id_created_at_idx" ON "job_clicks"("job_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "cities_geoname_id_key" ON "cities"("geoname_id");

-- CreateIndex
CREATE INDEX "cities_country_code_name_idx" ON "cities"("country_code", "name");

-- CreateIndex
CREATE INDEX "cities_country_code_admin1_code_name_idx" ON "cities"("country_code", "admin1_code", "name");

-- CreateIndex
CREATE INDEX "cities_ascii_name_idx" ON "cities"("ascii_name");

-- CreateIndex
CREATE UNIQUE INDEX "geocode_cache_raw_location_key" ON "geocode_cache"("raw_location");

-- AddForeignKey
ALTER TABLE "job_clicks" ADD CONSTRAINT "job_clicks_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
