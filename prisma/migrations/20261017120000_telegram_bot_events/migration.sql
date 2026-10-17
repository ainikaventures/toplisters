-- Telegram search-bot usage log
CREATE TABLE "telegram_bot_events" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "username" TEXT,
    "kind" TEXT NOT NULL,
    "query" TEXT,
    "results" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_bot_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_bot_events_created_at_idx" ON "telegram_bot_events"("created_at");
CREATE INDEX "telegram_bot_events_user_id_created_at_idx" ON "telegram_bot_events"("user_id", "created_at");
