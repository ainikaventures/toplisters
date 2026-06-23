-- CreateTable
CREATE TABLE "email_threads" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "recruiter_email" TEXT NOT NULL,
    "recruiter_name" TEXT,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "from_addr" TEXT NOT NULL,
    "to_addr" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "html" TEXT,
    "message_id" TEXT,
    "in_reply_to" TEXT,
    "provider_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_token_key" ON "email_threads"("token");

-- CreateIndex
CREATE INDEX "email_threads_last_message_at_idx" ON "email_threads"("last_message_at");

-- CreateIndex
CREATE INDEX "email_messages_thread_id_created_at_idx" ON "email_messages"("thread_id", "created_at");

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
