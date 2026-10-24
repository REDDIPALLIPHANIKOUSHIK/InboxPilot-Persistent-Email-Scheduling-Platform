import { prisma } from '../lib/prisma.js';
import { emailQueue } from '../lib/queue.js';
import {
  calculateScheduledAt,
  calculateBullMQDelay,
  isValidEmail,
  SEND_EMAIL_JOB_NAME,
  ScheduleEmailOutput,
  ScheduleEmailResponseData,
  PaginatedResponse,
  EmailDto,
} from '@inboxpilot/shared';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../lib/logger.js';
import { OutboxService, OutboxJobPayload } from './outbox.service.js';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';

export class EmailService {
  /**
   * Schedules a campaign and its individual emails using Transactional Outbox & Idempotency Keys
   */
  public static async scheduleCampaign(
    userId: string,
    payload: ScheduleEmailOutput
  ): Promise<ScheduleEmailResponseData> {
    const {
      name,
      subject,
      body,
      senderId: requestedSenderId,
      recipients,
      startAt: rawStartAt,
      delayBetweenEmailsMs,
      hourlyLimit: requestedHourlyLimit,
      idempotencyKey: clientCampaignKey,
    } = payload;

    const startAt = new Date(rawStartAt);
    if (isNaN(startAt.getTime())) {
      throw new AppError('Invalid start time format', 400, 'INVALID_START_TIME');
    }

    // Reject past scheduling times with 60-second grace window for client clock drift
    if (startAt.getTime() < Date.now() - 60000) {
      throw new AppError(
        'Scheduled start time cannot be in the past. Please select a current or future timestamp.',
        400,
        'PAST_SCHEDULING_TIME'
      );
    }

    // Resolve Sender
    let sender = null;
    if (requestedSenderId) {
      sender = await prisma.sender.findFirst({
        where: { id: requestedSenderId, userId },
      });
      if (!sender) {
        throw new AppError('Sender identity not found or access denied', 404, 'SENDER_NOT_FOUND');
      }
    } else {
      sender = await prisma.sender.findFirst({
        where: { userId, isDefault: true },
      });
      if (!sender) {
        sender = await prisma.sender.findFirst({
          where: { userId },
        });
      }
    }

    if (!sender) {
      throw new AppError('No sender configured for this account', 400, 'NO_SENDER_CONFIGURED');
    }

    const hourlyLimit = requestedHourlyLimit || sender.hourlyLimit;

    // Validate and deduplicate recipients
    const validEmails: string[] = [];
    const rejectedReasons: { email: string; reason: string }[] = [];
    const seen = new Set<string>();

    for (const r of recipients) {
      const email = typeof r === 'string' ? r.trim().toLowerCase() : '';
      if (!email || !isValidEmail(email)) {
        rejectedReasons.push({ email: r, reason: 'Invalid email address syntax' });
        continue;
      }
      if (seen.has(email)) {
        rejectedReasons.push({ email, reason: 'Duplicate recipient in request' });
        continue;
      }
      seen.add(email);
      validEmails.push(email);
    }

    if (validEmails.length === 0) {
      throw new AppError('No valid recipients provided to schedule', 400, 'NO_VALID_RECIPIENTS', {
        rejected: rejectedReasons,
      });
    }

    // PART 5: Check campaign idempotency if client provided an idempotency key
    if (clientCampaignKey) {
      const existingCampaign = await prisma.campaign.findFirst({
        where: {
          userId,
          idempotencyKey: clientCampaignKey,
        },
        include: { sender: true },
      });

      if (existingCampaign) {
        logger.info(
          `[IDEMPOTENCY] Returning existing campaign ${existingCampaign.id} for idempotency key "${clientCampaignKey}"`
        );
        const emails = await prisma.email.findMany({
          where: { campaignId: existingCampaign.id },
          orderBy: { scheduledAt: 'asc' },
        });

        return {
          campaign: {
            ...existingCampaign,
            status: existingCampaign.status as any,
            startAt: existingCampaign.startAt.toISOString(),
            createdAt: existingCampaign.createdAt.toISOString(),
            updatedAt: existingCampaign.updatedAt.toISOString(),
            sender: existingCampaign.sender
              ? {
                  ...existingCampaign.sender,
                  createdAt: existingCampaign.sender.createdAt.toISOString(),
                  updatedAt: existingCampaign.sender.updatedAt.toISOString(),
                }
              : undefined,
          },
          totalAccepted: emails.length,
          totalRejected: 0,
          rejectedReasons: [],
          firstScheduledAt: emails[0]?.scheduledAt.toISOString() || existingCampaign.startAt.toISOString(),
          lastScheduledAt:
            emails[emails.length - 1]?.scheduledAt.toISOString() || existingCampaign.startAt.toISOString(),
        };
      }
    }

    // Prepare Email and Outbox records
    const now = new Date();
    const campaignId = uuidv4();
    const emailRecordsToCreate: Array<{
      id: string;
      userId: string;
      senderId: string;
      recipientEmail: string;
      subject: string;
      body: string;
      scheduledAt: Date;
      status: string;
      idempotencyKey: string;
      bullmqJobId: string;
    }> = [];

    const outboxRecordsToCreate: Array<{
      id: string;
      campaignId: string;
      emailId: string;
      jobId: string;
      eventType: string;
      payload: string;
      delayMs: number;
      status: string;
    }> = [];

    for (let i = 0; i < validEmails.length; i++) {
      const recipient = validEmails[i];
      const emailId = uuidv4();
      const scheduledAt = calculateScheduledAt(startAt, i, delayBetweenEmailsMs);
      const delayMs = calculateBullMQDelay(scheduledAt, now);
      const stableJobId = `email:${emailId}`;
      const emailIdempotencyKey = `${campaignId}:${recipient}`;

      emailRecordsToCreate.push({
        id: emailId,
        userId,
        senderId: sender.id,
        recipientEmail: recipient,
        subject,
        body,
        scheduledAt,
        status: 'scheduled',
        idempotencyKey: emailIdempotencyKey,
        bullmqJobId: stableJobId,
      });

      const outboxPayload: OutboxJobPayload = {
        emailId,
        campaignId,
        senderId: sender.id,
        recipientEmail: recipient,
        subject,
        body,
        scheduledAt: scheduledAt.toISOString(),
        hourlyLimit,
        minimumSendIntervalMs: sender.minimumSendIntervalMs,
      };

      outboxRecordsToCreate.push({
        id: uuidv4(),
        campaignId,
        emailId,
        jobId: stableJobId,
        eventType: 'SCHEDULE_EMAIL',
        payload: JSON.stringify(outboxPayload),
        delayMs,
        status: 'pending',
      });
    }

    // PART 6: Database Transaction (Campaign, Emails, OutboxMessages atomically committed)
    let createdCampaign: any;
    try {
      createdCampaign = await prisma.$transaction(async (tx) => {
        const camp = await tx.campaign.create({
          data: {
            id: campaignId,
            userId,
            senderId: sender!.id,
            name: name || `Campaign ${new Date().toLocaleDateString()}`,
            subject,
            body,
            startAt,
            idempotencyKey: clientCampaignKey || null,
            delayBetweenEmailsMs,
            hourlyLimit,
            status: 'active',
            totalEmails: emailRecordsToCreate.length,
            sentCount: 0,
            failedCount: 0,
          },
          include: { sender: true },
        });

        await tx.email.createMany({
          data: emailRecordsToCreate.map((e) => ({
            ...e,
            campaignId: camp.id,
          })),
        });

        await tx.outboxMessage.createMany({
          data: outboxRecordsToCreate,
        });

        return camp;
      });
    } catch (err: any) {
      // Handle race condition: if concurrent request created with same idempotency key
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        if (clientCampaignKey) {
          logger.warn(
            `[IDEMPOTENCY-RACE] Caught unique constraint collision for idempotency key "${clientCampaignKey}". Fetching created campaign.`
          );
          const existing = await prisma.campaign.findFirst({
            where: { userId, idempotencyKey: clientCampaignKey },
            include: { sender: true },
          });
          if (existing) {
            const emails = await prisma.email.findMany({
              where: { campaignId: existing.id },
              orderBy: { scheduledAt: 'asc' },
            });
            return {
              campaign: {
                ...existing,
                status: existing.status as any,
                startAt: existing.startAt.toISOString(),
                createdAt: existing.createdAt.toISOString(),
                updatedAt: existing.updatedAt.toISOString(),
                sender: existing.sender
                  ? {
                      ...existing.sender,
                      createdAt: existing.sender.createdAt.toISOString(),
                      updatedAt: existing.sender.updatedAt.toISOString(),
                    }
                  : undefined,
              },
              totalAccepted: emails.length,
              totalRejected: 0,
              rejectedReasons: [],
              firstScheduledAt: emails[0]?.scheduledAt.toISOString() || existing.startAt.toISOString(),
              lastScheduledAt:
                emails[emails.length - 1]?.scheduledAt.toISOString() || existing.startAt.toISOString(),
            };
          }
        }
      }
      throw err;
    }

    // PART 6: Immediately dispatch outbox records to BullMQ
    // Even if Redis is momentarily unavailable, outbox rows exist with status='pending' and will be drained by reconciler
    const outboxIds = outboxRecordsToCreate.map((o) => o.id);
    OutboxService.dispatchOutboxMessages(outboxIds).catch((err) => {
      logger.warn(`Async outbox dispatch error: ${err.message}. Reconciler will recover.`);
    });

    const firstScheduledAt = emailRecordsToCreate[0].scheduledAt.toISOString();
    const lastScheduledAt = emailRecordsToCreate[emailRecordsToCreate.length - 1].scheduledAt.toISOString();

    return {
      campaign: {
        ...createdCampaign,
        status: createdCampaign.status as any,
        startAt: createdCampaign.startAt.toISOString(),
        createdAt: createdCampaign.createdAt.toISOString(),
        updatedAt: createdCampaign.updatedAt.toISOString(),
        sender: createdCampaign.sender
          ? {
              ...createdCampaign.sender,
              createdAt: createdCampaign.sender.createdAt.toISOString(),
              updatedAt: createdCampaign.sender.updatedAt.toISOString(),
            }
          : undefined,
      },
      totalAccepted: validEmails.length,
      totalRejected: rejectedReasons.length,
      rejectedReasons,
      firstScheduledAt,
      lastScheduledAt,
    };
  }

  /**
   * Get scheduled (non-terminal) emails for the user
   */
  public static async getScheduledEmails(
    userId: string,
    page: number = 1,
    limit: number = 20,
    search?: string
  ): Promise<PaginatedResponse<EmailDto>> {
    const where: any = {
      userId,
      status: { in: ['scheduled', 'processing'] },
    };

    if (search) {
      where.OR = [
        { recipientEmail: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, emails] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.findMany({
        where,
        orderBy: { scheduledAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sender: true,
          campaign: true,
        },
      }),
    ]);

    return {
      items: emails.map((e) => ({
        id: e.id,
        userId: e.userId,
        campaignId: e.campaignId,
        senderId: e.senderId,
        recipientEmail: e.recipientEmail,
        subject: e.subject,
        body: e.body,
        scheduledAt: e.scheduledAt.toISOString(),
        sentAt: e.sentAt ? e.sentAt.toISOString() : null,
        status: e.status as any,
        idempotencyKey: e.idempotencyKey,
        bullmqJobId: e.bullmqJobId,
        attempts: e.attempts,
        lastError: e.lastError,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
        sender: e.sender
          ? {
              ...e.sender,
              createdAt: e.sender.createdAt.toISOString(),
              updatedAt: e.sender.updatedAt.toISOString(),
            }
          : undefined,
        campaign: e.campaign
          ? {
              ...e.campaign,
              status: e.campaign.status as any,
              startAt: e.campaign.startAt.toISOString(),
              createdAt: e.campaign.createdAt.toISOString(),
              updatedAt: e.campaign.updatedAt.toISOString(),
            }
          : undefined,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get sent (terminal) emails for the user
   */
  public static async getSentEmails(
    userId: string,
    page: number = 1,
    limit: number = 20,
    search?: string
  ): Promise<PaginatedResponse<EmailDto>> {
    const where: any = {
      userId,
      status: { in: ['sent', 'failed'] },
    };

    if (search) {
      where.OR = [
        { recipientEmail: { contains: search, mode: 'insensitive' } },
        { subject: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, emails] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.findMany({
        where,
        orderBy: [{ sentAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          sender: true,
          campaign: true,
          deliveryAttempts: {
            orderBy: { attemptNumber: 'desc' },
          },
        },
      }),
    ]);

    return {
      items: emails.map((e) => ({
        id: e.id,
        userId: e.userId,
        campaignId: e.campaignId,
        senderId: e.senderId,
        recipientEmail: e.recipientEmail,
        subject: e.subject,
        body: e.body,
        scheduledAt: e.scheduledAt.toISOString(),
        sentAt: e.sentAt ? e.sentAt.toISOString() : null,
        status: e.status as any,
        idempotencyKey: e.idempotencyKey,
        bullmqJobId: e.bullmqJobId,
        attempts: e.attempts,
        lastError: e.lastError,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
        deliveryAttempts: e.deliveryAttempts.map((d) => ({
          id: d.id,
          emailId: d.emailId,
          attemptNumber: d.attemptNumber,
          startedAt: d.startedAt.toISOString(),
          completedAt: d.completedAt ? d.completedAt.toISOString() : null,
          status: d.status as any,
          errorMessage: d.errorMessage,
          providerMessageId: d.providerMessageId,
          createdAt: d.createdAt.toISOString(),
        })),
        etherealPreviewUrl: e.deliveryAttempts[0]?.providerMessageId
          ? `https://ethereal.email/message/${e.deliveryAttempts[0].providerMessageId}`
          : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Safe cancellation of a scheduled email
   */
  public static async cancelScheduledEmail(userId: string, emailId: string) {
    const email = await prisma.email.findFirst({
      where: { id: emailId, userId },
    });

    if (!email) {
      throw new AppError('Email record not found', 404, 'EMAIL_NOT_FOUND');
    }

    if (email.status === 'sent') {
      throw new AppError('Email has already been sent and cannot be cancelled', 400, 'ALREADY_SENT');
    }

    if (email.status === 'cancelled') {
      return email;
    }

    // Update DB status to cancelled
    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { status: 'cancelled' },
    });

    // Remove job from BullMQ if present
    if (email.bullmqJobId) {
      try {
        const job = await emailQueue.getJob(email.bullmqJobId);
        if (job) {
          await job.remove();
          logger.info(`Removed BullMQ job ${email.bullmqJobId} upon cancellation`);
        }
      } catch (err: any) {
        logger.warn(`Could not remove BullMQ job ${email.bullmqJobId}: ${err.message}`);
      }
    }

    return updated;
  }

  /**
   * Get single email by ID
   */
  public static async getEmailById(userId: string, emailId: string) {
    const email = await prisma.email.findFirst({
      where: { id: emailId, userId },
      include: {
        sender: true,
        campaign: true,
        deliveryAttempts: {
          orderBy: { attemptNumber: 'desc' },
        },
      },
    });

    if (!email) {
      throw new AppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    return email;
  }
}
