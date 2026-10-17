-- Card posts (country digest / company spotlight) audit log
CREATE TABLE "social_card_posts" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "external_id" TEXT,
    "external_url" TEXT,
    "error_message" TEXT,
    "posted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_card_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "social_card_posts_platform_kind_posted_at_idx" ON "social_card_posts"("platform", "kind", "posted_at");
CREATE INDEX "social_card_posts_kind_key_idx" ON "social_card_posts"("kind", "key");
