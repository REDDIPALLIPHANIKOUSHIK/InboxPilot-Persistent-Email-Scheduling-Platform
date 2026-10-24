import { prisma } from '../lib/prisma.js';
import { emailQueue } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { SEND_EMAIL_JOB_NAME } from '@inboxpilot/shared';

export interface OutboxJobPayload {
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

export class OutboxService {
  private static isReconciling = false;

  /**
   * Dispatches outbox messages to BullMQ queue and marks them as published
   */
  public static async dispatchOutboxMessages(messageIds?: string[]): Promise<{
    published: number;
    failed: number;
  }> {
    const whereClause: any = {
      status: 'pending',
    };

    if (messageIds && messageIds.length > 0) {
      whereClause.id = { in: messageIds };
    }

    const pendingMessages = await prisma.outboxMessage.findMany({
      where: whereClause,
      take: 200,
      orderBy: { createdAt: 'asc' },
    });

    if (pendingMessages.length === 0) {
      return { published: 0, failed: 0 };
    }

    const jobsToAdd: Array<{
      name: string;
      data: OutboxJobPayload;
      opts: {
        jobId: string;
        delay: number;
        attempts?: number;
        backoff?: {
          type: string;
          delay: number;
        };
      };
    }> = [];

    const validMessageIds: string[] = [];

    for (const msg of pendingMessages) {
      try {
        const payload: OutboxJobPayload = JSON.parse(msg.payload);
        const scheduledTime = payload.scheduledAt ? new Date(payload.scheduledAt).getTime() : NaN;
        const remainingDelay = !isNaN(scheduledTime)
          ? Math.max(0, scheduledTime - Date.now())
          : Math.max(0, msg.delayMs);

        jobsToAdd.push({
          name: SEND_EMAIL_JOB_NAME,
          data: payload,
          opts: {
            jobId: msg.jobId,
            delay: remainingDelay,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 3000,
            },
          },
        });
        validMessageIds.push(msg.id);
      } catch (err: any) {
        logger.error(`Invalid JSON payload in outbox message ${msg.id}: ${err.message}`);
        await prisma.outboxMessage.update({
          where: { id: msg.id },
          data: {
            status: 'failed',
            lastError: `Invalid JSON payload: ${err.message}`,
            retryCount: { increment: 1 },
          },
        });
      }
    }

    if (jobsToAdd.length === 0) {
      return { published: 0, failed: 0 };
    }

    try {
      // BullMQ addBulk with stable job IDs
      await emailQueue.addBulk(jobsToAdd);

      const now = new Date();
      await prisma.outboxMessage.updateMany({
        where: { id: { in: validMessageIds } },
        data: {
          status: 'published',
          publishedAt: now,
          lastError: null,
        },
      });

      logger.info(`[OUTBOX] Successfully published ${validMessageIds.length} messages to BullMQ`);
      return { published: validMessageIds.length, failed: 0 };
    } catch (err: any) {
      logger.error(`[OUTBOX] Failed to enqueue outbox messages to BullMQ: ${err.message}`);

      // Record error and increment retryCount so reconciliation loop can retry later
      await prisma.outboxMessage.updateMany({
        where: { id: { in: validMessageIds } },
        data: {
          lastError: err.message,
          retryCount: { increment: 1 },
        },
      });

      return { published: 0, failed: validMessageIds.length };
    }
  }

  /**
   * Periodic reconciliation loop: drains any pending outbox messages older than 3 seconds
   * Recovers from Redis outages, backend crashes, and network partitions.
   */
  public static async reconcileOutbox(): Promise<void> {
    if (this.isReconciling) {
      return;
    }

    this.isReconciling = true;
    try {
      const staleThreshold = new Date(Date.now() - 3000);
      const stalePending = await prisma.outboxMessage.findMany({
        where: {
          status: 'pending',
          createdAt: { lte: staleThreshold },
          retryCount: { lt: 10 },
        },
        select: { id: true },
        take: 100,
      });

      if (stalePending.length > 0) {
        logger.info(`[OUTBOX-RECONCILE] Found ${stalePending.length} pending outbox messages. Dispatching...`);
        await this.dispatchOutboxMessages(stalePending.map((m) => m.id));
      }
    } catch (err: any) {
      logger.warn(`[OUTBOX-RECONCILE] Error during outbox reconciliation: ${err.message}`);
    } finally {
      this.isReconciling = false;
    }
  }
}
