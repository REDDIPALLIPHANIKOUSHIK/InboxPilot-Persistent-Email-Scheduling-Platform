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

      // Hard idempotency constraint: never resend an email already sent
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

      const hourlyLimit = email.sender?.hourlyLimit || job.data.hourlyLimit || env.MAX_EMAILS_PER_HOUR_PER_SENDER;
      const minSendIntervalMs = email.sender?.minimumSendIntervalMs ?? job.data.minimumSendIntervalMs ?? env.MIN_SEND_INTERVAL_MS;

      // 2. Enforce Minimum Send Interval across distributed workers
      if (minSendIntervalMs > 0) {
        const spacing = await limiter.checkSendSpacing(email.senderId, minSendIntervalMs);
        if (!spacing.allowed && spacing.waitMs > 0) {
          if (spacing.waitMs <= 2000) {
            // Short delay: sleep inline
            logger.debug(`Applying short inline delay of ${spacing.waitMs}ms for sender ${email.senderId}`);
            await new Promise((resolve) => setTimeout(resolve, spacing.waitMs));
          } else {
            // Longer delay: reschedule job in BullMQ
            logger.info(`Spacing delay: Re-delaying job ${job.id} by ${spacing.waitMs}ms to respect interval`);
            if (token) {
              await job.moveToDelayed(Date.now() + spacing.waitMs, token);
              throw new DelayedError();
            }
          }
        }
      }

      // 3. Enforce Distributed Hourly Rate Limit
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

      // 4. Mark status as 'processing' and record delivery attempt
      const attemptNumber = email.attempts + 1;
      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: 'processing',
          attempts: attemptNumber,
        },
      });

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

        // 6. Record Success
        const now = new Date();
        await prisma.$transaction([
          prisma.deliveryAttempt.update({
            where: { id: attemptId },
            data: {
              completedAt: now,
              status: 'success',
              providerMessageId: result.messageId,
            },
          }),
          prisma.email.update({
            where: { id: email.id },
            data: {
              status: 'sent',
              sentAt: now,
              lastError: null,
            },
          }),
          prisma.campaign.update({
            where: { id: email.campaignId },
            data: {
              sentCount: { increment: 1 },
            },
          }),
        ]);

        logger.info(`✅ Email [${email.id}] successfully sent to <${email.recipientEmail}>!`);
        if (result.previewUrl) {
          logger.info(`🔗 Ethereal Preview URL: ${result.previewUrl}`);
        }

        // Check if all emails in the campaign have completed
        const campaign = await prisma.campaign.findUnique({
          where: { id: email.campaignId },
          select: { totalEmails: true, sentCount: true, failedCount: true },
        });

        if (campaign && campaign.sentCount + campaign.failedCount >= campaign.totalEmails) {
          await prisma.campaign.update({
            where: { id: email.campaignId },
            data: { status: 'completed' },
          });
          logger.info(`🎉 Campaign ${email.campaignId} completed (${campaign.sentCount} sent, ${campaign.failedCount} failed)`);
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
          err.responseCode && err.responseCode >= 500 && err.responseCode < 600;

        await prisma.deliveryAttempt.update({
          where: { id: attemptId },
          data: {
            completedAt: new Date(),
            status: 'failed',
            errorMessage: err.message,
          },
        });

        if (isPermanentError || attemptNumber >= 3) {
          // Terminal failure
          await prisma.$transaction([
            prisma.email.update({
              where: { id: email.id },
              data: {
                status: 'failed',
                lastError: err.message,
              },
            }),
            prisma.campaign.update({
              where: { id: email.campaignId },
              data: {
                failedCount: { increment: 1 },
              },
            }),
          ]);
          logger.warn(`Email ${email.id} permanently failed after ${attemptNumber} attempts.`);
        } else {
          // Retryable error: revert status to scheduled so BullMQ backoff works
          await prisma.email.update({
            where: { id: email.id },
            data: {
              status: 'scheduled',
              lastError: err.message,
            },
          });
          throw err; // Trigger BullMQ retry
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
