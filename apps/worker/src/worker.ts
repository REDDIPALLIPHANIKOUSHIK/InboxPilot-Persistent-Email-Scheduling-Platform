import { Worker, Job, DelayedError } from 'bullmq';
import { EMAIL_QUEUE_NAME, SEND_EMAIL_JOB_NAME } from '@inboxpilot/shared';
import { env } from './config/env.js';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { sendEmailViaEthereal } from './lib/mailer.js';
import { DistributedLimiter } from './rateLimiter/distributedLimiter.js';
import crypto from 'crypto';

export interface SendEmailJobData {
  emailId: string;
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  hourlyLimit: number;
  minimumSendIntervalMs: number;
}

const limiter = new DistributedLimiter(redis);

/**
 * BullMQ Worker instance processing email scheduling jobs
 */
export function createEmailWorker(): Worker {
  const worker = new Worker<SendEmailJobData>(
    EMAIL_QUEUE_NAME,
    async (job: Job<SendEmailJobData>, token?: string) => {
      const { emailId } = job.data;
      logger.info(`Processing job ${job.id} for email ${emailId}`);

      // 1. Load email from database
      const email = await prisma.email.findUnique({
        where: { id: emailId },
        include: {
          sender: true,
          campaign: true,
        },
      });

      if (!email) {
        logger.warn(`Email record ${emailId} not found in DB. Skipping job.`);
        return { skipped: true, reason: 'EMAIL_NOT_FOUND' };
      }

      // Hard idempotency constraints: never resend terminal emails
      if (email.status === 'sent') {
        logger.info(`Idempotency guard: Email ${emailId} already marked as sent. Skipping.`);
        return { skipped: true, reason: 'ALREADY_SENT' };
      }

      if (email.status === 'cancelled') {
        logger.info(`Email ${emailId} was cancelled by user. Skipping.`);
        return { skipped: true, reason: 'CANCELLED' };
      }

      if (email.status === 'failed' && email.attempts >= 3) {
        logger.info(`Email ${emailId} reached maximum attempts and is failed. Skipping.`);
        return { skipped: true, reason: 'MAX_ATTEMPTS_REACHED' };
      }

      const hourlyLimit =
        email.sender?.hourlyLimit || job.data.hourlyLimit || env.MAX_EMAILS_PER_HOUR_PER_SENDER;
      const minSendIntervalMs =
        email.sender?.minimumSendIntervalMs ?? job.data.minimumSendIntervalMs ?? env.MIN_SEND_INTERVAL_MS;

      // 2. Enforce Minimum Send Interval across distributed workers (PART 4)
      // Check spacing BEFORE rate limit so quota is not consumed if spacing is delayed
      if (minSendIntervalMs > 0) {
        const spacing = await limiter.checkSendSpacing(email.senderId, minSendIntervalMs);
        if (!spacing.allowed && spacing.waitMs > 0) {
          logger.info(
            `[SPACING] Sender ${email.senderId} must wait ${spacing.waitMs}ms to respect interval. Rescheduling job ${job.id}`
          );
          if (token) {
            await job.moveToDelayed(Date.now() + spacing.waitMs, token);
            throw new DelayedError();
          }
          return { rescheduled: true, reason: 'SPACING_DELAY', waitMs: spacing.waitMs };
        }
      }

      // 3. Enforce Distributed Hourly Rate Limit (PART 3)
      const rateLimit = await limiter.acquireHourlySlot(email.senderId, hourlyLimit, email.id);
      if (!rateLimit.allowed) {
        const newScheduledAt = new Date(Date.now() + rateLimit.retryAfterMs);
        logger.info(
          `[RATE-LIMIT] Sender ${email.senderId} reached hourly limit (${rateLimit.currentCount}/${hourlyLimit}). Rescheduling email ${email.id} by ${rateLimit.retryAfterMs}ms to ${newScheduledAt.toISOString()}`
        );

        // Update DB scheduledAt timestamp
        await prisma.email.update({
          where: { id: email.id },
          data: { scheduledAt: newScheduledAt },
        });

        // Reschedule in BullMQ
        if (token) {
          await job.moveToDelayed(Date.now() + rateLimit.retryAfterMs, token);
          throw new DelayedError();
        }
        return { rescheduled: true, retryAfterMs: rateLimit.retryAfterMs };
      }

      // 4. Safe conditional state transition to 'processing' (PART 7)
      const attemptNumber = email.attempts + 1;
      const leaseResult = await prisma.email.updateMany({
        where: {
          id: email.id,
          status: { in: ['scheduled', 'processing'] },
        },
        data: {
          status: 'processing',
          attempts: { increment: 1 },
        },
      });

      if (leaseResult.count === 0) {
        logger.warn(
          `Email ${email.id} state transition failed (already sent, cancelled, or in conflict). Aborting job.`
        );
        await limiter.releaseHourlySlot(email.senderId, email.id);
        return { skipped: true, reason: 'STATE_CONFLICT' };
      }

      const attemptId = crypto.randomUUID();
      await prisma.deliveryAttempt.create({
        data: {
          id: attemptId,
          emailId: email.id,
          attemptNumber,
          startedAt: new Date(),
          status: 'pending',
        },
      });

      // 5. Send via Ethereal SMTP
      try {
        const result = await sendEmailViaEthereal({
          fromName: email.sender.name,
          fromEmail: email.sender.email,
          toEmail: email.recipientEmail,
          subject: email.subject,
          body: email.body,
        });

        // 6. Record Success with atomic conditional update
        const now = new Date();
        const updateSentResult = await prisma.email.updateMany({
          where: { id: email.id, status: 'processing' },
          data: {
            status: 'sent',
            sentAt: now,
            lastError: null,
          },
        });

        await prisma.deliveryAttempt.update({
          where: { id: attemptId },
          data: {
            completedAt: now,
            status: 'success',
            providerMessageId: result.messageId,
          },
        });

        if (updateSentResult.count > 0) {
          const campaign = await prisma.campaign.update({
            where: { id: email.campaignId },
            data: {
              sentCount: { increment: 1 },
            },
            select: { totalEmails: true, sentCount: true, failedCount: true },
          });

          if (campaign && campaign.sentCount + campaign.failedCount >= campaign.totalEmails) {
            await prisma.campaign.update({
              where: { id: email.campaignId },
              data: { status: 'completed' },
            });
            logger.info(
              `🎉 Campaign ${email.campaignId} completed (${campaign.sentCount} sent, ${campaign.failedCount} failed)`
            );
          }
        }

        logger.info(`✅ Email [${email.id}] successfully sent to <${email.recipientEmail}>!`);
        if (result.previewUrl) {
          logger.info(`🔗 Ethereal Preview URL: ${result.previewUrl}`);
        }

        return {
          success: true,
          emailId: email.id,
          messageId: result.messageId,
          previewUrl: result.previewUrl,
        };
      } catch (err: any) {
        logger.error(`❌ SMTP Delivery failed for email ${email.id}: ${err.message}`);

        // Release hourly slot since transmission failed
        await limiter.releaseHourlySlot(email.senderId, email.id);

        const isPermanentError =
          (err.responseCode && err.responseCode >= 500 && err.responseCode < 600) ||
          (err.code && ['EENVELOPE', 'EDNS', 'EAUTH', 'INVALID_ADDRESS'].includes(err.code)) ||
          attemptNumber >= 3;

        await prisma.deliveryAttempt.update({
          where: { id: attemptId },
          data: {
            completedAt: new Date(),
            status: 'failed',
            errorMessage: err.message,
          },
        });

        if (isPermanentError) {
          // Terminal failure
          const updateFailResult = await prisma.email.updateMany({
            where: { id: email.id, status: 'processing' },
            data: {
              status: 'failed',
              lastError: err.message,
            },
          });

          if (updateFailResult.count > 0) {
            const campaign = await prisma.campaign.update({
              where: { id: email.campaignId },
              data: {
                failedCount: { increment: 1 },
              },
              select: { totalEmails: true, sentCount: true, failedCount: true },
            });

            if (campaign && campaign.sentCount + campaign.failedCount >= campaign.totalEmails) {
              await prisma.campaign.update({
                where: { id: email.campaignId },
                data: { status: 'completed' },
              });
              logger.info(
                `🎉 Campaign ${email.campaignId} completed (${campaign.sentCount} sent, ${campaign.failedCount} failed)`
              );
            }
          }
          logger.warn(`Email ${email.id} permanently failed after ${attemptNumber} attempts.`);
        } else {
          // Retryable error: revert status to scheduled so BullMQ backoff works safely
          await prisma.email.updateMany({
            where: { id: email.id, status: 'processing' },
            data: {
              status: 'scheduled',
              lastError: err.message,
            },
          });
          throw err; // Trigger BullMQ retry with exponential backoff
        }

        return { success: false, error: err.message };
      }
    },
    {
      connection: redis,
      concurrency: env.WORKER_CONCURRENCY,
      limiter: {
        max: 50,
        duration: 1000,
      },
    }
  );

  worker.on('ready', () => {
    logger.info(`BullMQ Worker ready with concurrency: ${env.WORKER_CONCURRENCY}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed with error: ${err.message}`);
  });

  worker.on('error', (err) => {
    logger.error(`BullMQ Worker connection error: ${err.message}`);
  });

  return worker;
}
