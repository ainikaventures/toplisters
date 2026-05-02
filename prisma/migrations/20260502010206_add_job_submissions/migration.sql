-- CreateTable
CREATE TABLE "job_submissions" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email_confirmed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_submissions_job_id_key" ON "job_submissions"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_submissions_token_key" ON "job_submissions"("token");

-- CreateIndex
CREATE INDEX "job_submissions_email_confirmed_at_idx" ON "job_submissions"("email_confirmed_at");

-- AddForeignKey
ALTER TABLE "job_submissions" ADD CONSTRAINT "job_submissions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
