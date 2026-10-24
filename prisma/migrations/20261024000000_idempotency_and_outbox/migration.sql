-- AlterTable: Add idempotencyKey to campaigns
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "campaigns_userId_idempotencyKey_key" ON "campaigns"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "campaigns_idempotencyKey_idx" ON "campaigns"("idempotencyKey");

-- CreateTable: outbox_messages
CREATE TABLE IF NOT EXISTS "outbox_messages" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "emailId" TEXT,
    "jobId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT 'SCHEDULE_EMAIL',
    "payload" TEXT NOT NULL,
    "delayMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "outbox_messages_jobId_key" ON "outbox_messages"("jobId");
CREATE INDEX IF NOT EXISTS "outbox_messages_status_createdAt_idx" ON "outbox_messages"("status", "createdAt");
