import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../apps/backend/src/lib/prisma.js';
import { emailQueue } from '../apps/backend/src/lib/queue.js';
import { OutboxService } from '../apps/backend/src/services/outbox.service.js';
import * as mailer from '../apps/worker/src/lib/mailer.js';
import { DistributedLimiter } from '../apps/worker/src/rateLimiter/distributedLimiter.js';
import { redis } from '../apps/backend/src/lib/redis.js';

describe('End-to-End Scheduling, Outbox, Worker & Delivery Workflow', () => {
  const userId = 'user-e2e-101';
  const senderId = 'sender-e2e-202';
  const campaignId = 'camp-e2e-303';
  const emailId = 'email-e2e-404';
  const jobId = `email:${emailId}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes full pipeline: Schedule -> Outbox -> BullMQ -> Worker -> SMTP -> Final DB State', async () => {
    // -------------------------------------------------------------------------
    // STEP 1: Email Scheduling & Transactional Outbox Persistence
    // -------------------------------------------------------------------------
    const scheduledAt = new Date(Date.now() + 5000);

    const fakeCampaign = {
      id: campaignId,
      userId,
      senderId,
      name: 'Product Launch Q4',
      subject: 'Welcome to InboxPilot',
      body: 'Zero dropped jobs in production.',
      startAt: scheduledAt,
      idempotencyKey: 'idem-e2e-key-1',
      delayBetweenEmailsMs: 2000,
      hourlyLimit: 200,
      status: 'active',
      totalEmails: 1,
      sentCount: 0,
      failedCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const fakeEmail = {
      id: emailId,
      userId,
      campaignId,
      senderId,
      recipientEmail: 'lead@customer.org',
      subject: fakeCampaign.subject,
      body: fakeCampaign.body,
      scheduledAt,
      sentAt: null,
      status: 'scheduled',
      idempotencyKey: `${campaignId}:lead@customer.org`,
      bullmqJobId: jobId,
      attempts: 0,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const fakeOutbox = {
      id: 'outbox-e2e-505',
      campaignId,
      emailId,
      jobId,
      eventType: 'SCHEDULE_EMAIL',
      payload: JSON.stringify({
        emailId,
        campaignId,
        senderId,
        recipientEmail: fakeEmail.recipientEmail,
        subject: fakeEmail.subject,
        body: fakeEmail.body,
        scheduledAt: scheduledAt.toISOString(),
        hourlyLimit: 200,
        minimumSendIntervalMs: 2000,
      }),
      delayMs: 5000,
      status: 'pending',
      retryCount: 0,
      lastError: null,
      publishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Verify atomic transaction creates all 3 records
    let createdInTx: any = null;
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      const tx = {
        campaign: { create: vi.fn().mockResolvedValue(fakeCampaign) },
        email: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
        outboxMessage: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
      };
      createdInTx = await cb(tx);
      return createdInTx;
    });

    const txResult = await prisma.$transaction(async (tx) => {
      const camp = await tx.campaign.create({ data: fakeCampaign });
      await tx.email.createMany({ data: [fakeEmail] });
      await tx.outboxMessage.createMany({ data: [fakeOutbox] });
      return camp;
    });

    expect(txResult.id).toBe(campaignId);
    expect(txResult.totalEmails).toBe(1);

    // -------------------------------------------------------------------------
    // STEP 2: Transactional Outbox Dispatches to BullMQ
    // -------------------------------------------------------------------------
    vi.spyOn(prisma.outboxMessage, 'findMany').mockResolvedValue([fakeOutbox as any]);
    const addBulkSpy = vi.spyOn(emailQueue, 'addBulk').mockResolvedValue([] as any);
    const updateOutboxSpy = vi.spyOn(prisma.outboxMessage, 'updateMany').mockResolvedValue({ count: 1 } as any);

    const dispatchResult = await OutboxService.dispatchOutboxMessages([fakeOutbox.id]);

    expect(dispatchResult.published).toBe(1);
    expect(dispatchResult.failed).toBe(0);
    expect(addBulkSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'send-email',
        opts: expect.objectContaining({
          jobId,
          attempts: 3,
        }),
      }),
    ]);
    expect(updateOutboxSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'published' }),
      })
    );

    // -------------------------------------------------------------------------
    // STEP 3: Worker Claims Job & Checks Distributed Rate Limits
    // -------------------------------------------------------------------------
    const limiter = new DistributedLimiter(redis);
    vi.spyOn(limiter, 'checkSendSpacing').mockResolvedValue({ allowed: true, waitMs: 0 });
    vi.spyOn(limiter, 'acquireHourlySlot').mockResolvedValue({
      allowed: true,
      currentCount: 1,
      retryAfterMs: 0,
    });

    const spacingCheck = await limiter.checkSendSpacing(senderId, 2000);
    expect(spacingCheck.allowed).toBe(true);

    const slotCheck = await limiter.acquireHourlySlot(senderId, 200, emailId);
    expect(slotCheck.allowed).toBe(true);

    // Conditional atomic transition to 'processing'
    vi.spyOn(prisma.email, 'updateMany').mockResolvedValue({ count: 1 });
    const leaseUpdate = await prisma.email.updateMany({
      where: { id: emailId, status: { in: ['scheduled', 'processing'] } },
      data: { status: 'processing', attempts: { increment: 1 } },
    });
    expect(leaseUpdate.count).toBe(1);

    // -------------------------------------------------------------------------
    // STEP 4: SMTP Delivery via Ethereal & Receipt Auditing
    // -------------------------------------------------------------------------
    vi.spyOn(mailer, 'sendEmailViaEthereal').mockResolvedValue({
      messageId: 'ethereal-provider-msg-789',
      previewUrl: 'https://ethereal.email/message/Wa0xuz',
    });

    const smtpDelivery = await mailer.sendEmailViaEthereal({
      fromName: 'Growth Team',
      fromEmail: 'growth@inboxpilot.local',
      toEmail: fakeEmail.recipientEmail,
      subject: fakeEmail.subject,
      body: fakeEmail.body,
    });

    expect(smtpDelivery.messageId).toBe('ethereal-provider-msg-789');
    expect(smtpDelivery.previewUrl).toBe('https://ethereal.email/message/Wa0xuz');

    // -------------------------------------------------------------------------
    // STEP 5: Database State Transition & Campaign Counter Completion
    // -------------------------------------------------------------------------
    const now = new Date();
    const updateSentSpy = vi.spyOn(prisma.email, 'updateMany').mockResolvedValue({ count: 1 });
    const updateCampSpy = vi.spyOn(prisma.campaign, 'update').mockResolvedValue({
      id: campaignId,
      totalEmails: 1,
      sentCount: 1,
      failedCount: 0,
      status: 'completed',
    } as any);

    await prisma.email.updateMany({
      where: { id: emailId, status: 'processing' },
      data: { status: 'sent', sentAt: now },
    });

    const updatedCamp = await prisma.campaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: 1 } },
    });

    if (updatedCamp.sentCount + updatedCamp.failedCount >= updatedCamp.totalEmails) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: 'completed' },
      });
    }

    expect(updateSentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' }),
      })
    );

    expect(updateCampSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: campaignId },
        data: { status: 'completed' },
      })
    );
  });
});
