-- Freedom-oriented visa-pathway tags (Task 9)
ALTER TABLE "jobs" ADD COLUMN "flexible_visa" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "jobs" ADD COLUMN "visa_schemes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "jobs_flexible_visa_is_active_idx" ON "jobs"("flexible_visa", "is_active");
