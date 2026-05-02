-- CreateTable
CREATE TABLE "company_logos" (
    "id" SERIAL NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "domain" TEXT,
    "logo_url" TEXT,
    "looked_up_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_logos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_logos_normalized_name_key" ON "company_logos"("normalized_name");
