-- Complete Idempotent Schema Migration for InboxPilot
-- Supports starting from a clean PostgreSQL database or upgrading an existing instance

-- CreateTable: users
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT NOT NULL,
    "googleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: senders
CREATE TABLE IF NOT EXISTS "senders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 200,
    "minimumSendIntervalMs" INTEGER NOT NULL DEFAULT 2000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "senders_pkey" PRIMARY KEY ("id")
);

-- CreateTable: campaigns
CREATE TABLE IF NOT EXISTS "campaigns" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT,
    "delayBetweenEmailsMs" INTEGER NOT NULL DEFAULT 1000,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 200,
    "status" TEXT NOT NULL DEFAULT 'active',
    "totalEmails" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add idempotencyKey to campaigns if table already existed without it
ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- CreateTable: emails
CREATE TABLE IF NOT EXISTS "emails" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "idempotencyKey" TEXT NOT NULL,
    "bullmqJobId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable: delivery_attempts
CREATE TABLE IF NOT EXISTS "delivery_attempts" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- Indexes & Uniques
CREATE UNIQUE INDEX IF NOT EXISTS "users_googleId_key" ON "users"("googleId");
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE INDEX IF NOT EXISTS "senders_userId_idx" ON "senders"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "campaigns_userId_idempotencyKey_key" ON "campaigns"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "campaigns_userId_idx" ON "campaigns"("userId");
CREATE INDEX IF NOT EXISTS "campaigns_senderId_idx" ON "campaigns"("senderId");
CREATE INDEX IF NOT EXISTS "campaigns_status_idx" ON "campaigns"("status");
CREATE INDEX IF NOT EXISTS "campaigns_idempotencyKey_idx" ON "campaigns"("idempotencyKey");

CREATE UNIQUE INDEX IF NOT EXISTS "emails_idempotencyKey_key" ON "emails"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "emails_userId_idx" ON "emails"("userId");
CREATE INDEX IF NOT EXISTS "emails_campaignId_idx" ON "emails"("campaignId");
CREATE INDEX IF NOT EXISTS "emails_senderId_idx" ON "emails"("senderId");
CREATE INDEX IF NOT EXISTS "emails_status_idx" ON "emails"("status");
CREATE INDEX IF NOT EXISTS "emails_scheduledAt_idx" ON "emails"("scheduledAt");
CREATE INDEX IF NOT EXISTS "emails_idempotencyKey_idx" ON "emails"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "delivery_attempts_emailId_idx" ON "delivery_attempts"("emailId");

CREATE UNIQUE INDEX IF NOT EXISTS "outbox_messages_jobId_key" ON "outbox_messages"("jobId");
CREATE INDEX IF NOT EXISTS "outbox_messages_status_createdAt_idx" ON "outbox_messages"("status", "createdAt");

-- Foreign Keys
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'senders_userId_fkey') THEN
    ALTER TABLE "senders" ADD CONSTRAINT "senders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_userId_fkey') THEN
    ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_senderId_fkey') THEN
    ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_userId_fkey') THEN
    ALTER TABLE "emails" ADD CONSTRAINT "emails_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_campaignId_fkey') THEN
    ALTER TABLE "emails" ADD CONSTRAINT "emails_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emails_senderId_fkey') THEN
    ALTER TABLE "emails" ADD CONSTRAINT "emails_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "senders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_attempts_emailId_fkey') THEN
    ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
