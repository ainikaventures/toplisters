-- CreateTable
CREATE TABLE "subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "work_modes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confirm_token" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3),
    "unsubscribe_token" TEXT NOT NULL,
    "unsubscribed_at" TIMESTAMP(3),
    "last_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_email_key" ON "subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_confirm_token_key" ON "subscribers"("confirm_token");

-- CreateIndex
CREATE UNIQUE INDEX "subscribers_unsubscribe_token_key" ON "subscribers"("unsubscribe_token");

-- CreateIndex
CREATE INDEX "subscribers_confirmed_at_unsubscribed_at_idx" ON "subscribers"("confirmed_at", "unsubscribed_at");
