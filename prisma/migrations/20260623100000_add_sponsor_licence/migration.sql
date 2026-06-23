-- UK Register of Licensed Sponsors enrichment (Task 8)
ALTER TABLE "jobs" ADD COLUMN "employer_licensed_sponsor" BOOLEAN;
ALTER TABLE "jobs" ADD COLUMN "sponsor_routes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "jobs" ADD COLUMN "sponsor_rating" TEXT;
ALTER TABLE "jobs" ADD COLUMN "sponsor_match_confidence" TEXT;
ALTER TABLE "jobs" ADD COLUMN "sponsor_checked_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "jobs_employer_licensed_sponsor_is_active_idx" ON "jobs"("employer_licensed_sponsor", "is_active");
