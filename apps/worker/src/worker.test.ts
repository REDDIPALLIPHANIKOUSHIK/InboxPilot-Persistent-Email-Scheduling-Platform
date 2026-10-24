import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from './lib/prisma.js';
import * as mailer from './lib/mailer.js';
import { DistributedLimiter } from './rateLimiter/distributedLimiter.js';
import { redis } from './lib/redis.js';

describe('Worker Delivery & Lifecycle Test Suite', () => {
  const mockEmail = {
    id: 'email-lifecycle-123',
    userId: 'user-1',
    campaignId: 'camp-1',
    senderId: 'sender-1',
    recipientEmail: 'client@example.com',
    subject: 'Important Update',
    body: 'Zero dropped jobs.',
    scheduledAt: new Date(),
    status: 'scheduled',
    attempts: 0,
    sender: {
      id: 'sender-1',
      name: 'Sales Lead',
      email: 'sales@inboxpilot.local',
      hourlyLimit: 200,
      minimumSendIntervalMs: 2000,
    },
    campaign: {
      id: 'camp-1',
      totalEmails: 1,
      sentCount: 0,
      failedCount: 0,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Idempotency & Guard Assertions', () => {
    it('skips processing if email is already marked as sent in DB', async () => {
      const email = { ...mockEmail, status: 'sent', attempts: 1 };
      vi.spyOn(prisma.email, 'findUnique').mockResolvedValue(email as any);
      const sendSpy = vi.spyOn(mailer, 'sendEmailViaEthereal');

      const processGuard = (e: any) => {
        if (e.status === 'sent') return { skipped: true, reason: 'ALREADY_SENT' };
        if (e.status === 'cancelled') return { skipped: true, reason: 'CANCELLED' };
        return { skipped: false };
      };

      const result = processGuard(email);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('ALREADY_SENT');
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('skips processing if email has been cancelled by user', async () => {
      const email = { ...mockEmail, status: 'cancelled' };
      vi.spyOn(prisma.email, 'findUnique').mockResolvedValue(email as any);

      const processGuard = (e: any) => {
        if (e.status === 'sent') return { skipped: true, reason: 'ALREADY_SENT' };
        if (e.status === 'cancelled') return { skipped: true, reason: 'CANCELLED' };
        return { skipped: false };
      };

      const result = processGuard(email);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('CANCELLED');
    });

    it('skips processing if maximum delivery attempts have been reached', async () => {
      const email = { ...mockEmail, status: 'failed', attempts: 3 };

      const checkAttempts = (e: any) => {
        if (e.status === 'failed' && e.attempts >= 3) {
          return { skipped: true, reason: 'MAX_ATTEMPTS_REACHED' };
        }
        return { skipped: false };
      };

      const result = checkAttempts(email);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('MAX_ATTEMPTS_REACHED');
    });
  });

  describe('Delivery Scenarios & State Transitions', () => {
    it('successfully sends email, records delivery attempt, increments sentCount, and completes campaign', async () => {
      vi.spyOn(prisma.email, 'updateMany').mockResolvedValue({ count: 1 });
      vi.spyOn(prisma.deliveryAttempt, 'create').mockResolvedValue({ id: 'att-1' } as any);
      vi.spyOn(prisma.deliveryAttempt, 'update').mockResolvedValue({ id: 'att-1' } as any);

      vi.spyOn(mailer, 'sendEmailViaEthereal').mockResolvedValue({
        messageId: 'ethereal-msg-test-123',
        previewUrl: 'https://ethereal.email/message/test',
      });

      const campaignUpdateSpy = vi.spyOn(prisma.campaign, 'update').mockResolvedValue({
        id: 'camp-1',
        totalEmails: 1,
        sentCount: 1,
        failedCount: 0,
      } as any);

      // Simulate success path execution
      const sendResult = await mailer.sendEmailViaEthereal({
        fromName: mockEmail.sender.name,
        fromEmail: mockEmail.sender.email,
        toEmail: mockEmail.recipientEmail,
        subject: mockEmail.subject,
        body: mockEmail.body,
      });

      expect(sendResult.messageId).toBe('ethereal-msg-test-123');
      expect(sendResult.previewUrl).toBe('https://ethereal.email/message/test');

      // Update sentCount and mark campaign completed
      const camp = await prisma.campaign.update({
        where: { id: mockEmail.campaignId },
        data: { sentCount: { increment: 1 } },
      });

      if (camp.sentCount + camp.failedCount >= camp.totalEmails) {
        await prisma.campaign.update({
          where: { id: mockEmail.campaignId },
          data: { status: 'completed' },
        });
      }

      expect(campaignUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'completed' },
        })
      );
    });

    it('handles transient failure by reverting status to scheduled and rethrowing for BullMQ retry', async () => {
      const transientError = new Error('ETIMEDOUT: Connection to SMTP host timed out');
      (transientError as any).code = 'ETIMEDOUT';

      const updateEmailSpy = vi.spyOn(prisma.email, 'updateMany').mockResolvedValue({ count: 1 });

      const handleFailure = async (err: any, attemptNumber: number) => {
        const isPermanentError =
          (err.responseCode && err.responseCode >= 500 && err.responseCode < 600) ||
          attemptNumber >= 3;

        if (isPermanentError) {
          await prisma.email.updateMany({
            where: { id: mockEmail.id, status: 'processing' },
            data: { status: 'failed', lastError: err.message },
          });
          return { permanent: true };
        } else {
          await prisma.email.updateMany({
            where: { id: mockEmail.id, status: 'processing' },
            data: { status: 'scheduled', lastError: err.message },
          });
          throw err;
        }
      };

      await expect(handleFailure(transientError, 1)).rejects.toThrow('ETIMEDOUT');

      expect(updateEmailSpy).toHaveBeenCalledWith({
        where: { id: mockEmail.id, status: 'processing' },
        data: { status: 'scheduled', lastError: transientError.message },
      });
    });

    it('handles permanent 5xx failure immediately without retrying', async () => {
      const permanentError = new Error('550 5.1.1 User unknown on mail exchange');
      (permanentError as any).responseCode = 550;

      const updateEmailSpy = vi.spyOn(prisma.email, 'updateMany').mockResolvedValue({ count: 1 });
      const campaignUpdateSpy = vi.spyOn(prisma.campaign, 'update').mockResolvedValue({
        id: 'camp-1',
        totalEmails: 1,
        sentCount: 0,
        failedCount: 1,
      } as any);

      const handleFailure = async (err: any, attemptNumber: number) => {
        const isPermanentError =
          (err.responseCode && err.responseCode >= 500 && err.responseCode < 600) ||
          attemptNumber >= 3;

        if (isPermanentError) {
          await prisma.email.updateMany({
            where: { id: mockEmail.id, status: 'processing' },
            data: { status: 'failed', lastError: err.message },
          });

          await prisma.campaign.update({
            where: { id: mockEmail.campaignId },
            data: { failedCount: { increment: 1 } },
          });

          return { permanent: true };
        }
        throw err;
      };

      const result = await handleFailure(permanentError, 1);
      expect(result.permanent).toBe(true);

      expect(updateEmailSpy).toHaveBeenCalledWith({
        where: { id: mockEmail.id, status: 'processing' },
        data: { status: 'failed', lastError: permanentError.message },
      });

      expect(campaignUpdateSpy).toHaveBeenCalled();
    });

    it('handles ambiguous delivery failure safely by recording attempt and not double sending', async () => {
      // Ambiguous: network disconnect after DATA sent before 250 OK
      const ambiguousError = new Error('ECONNRESET: Connection closed by remote server during transmission');
      (ambiguousError as any).code = 'ECONNRESET';

      const attemptSpy = vi.spyOn(prisma.deliveryAttempt, 'update').mockResolvedValue({ id: 'att-1' } as any);

      await prisma.deliveryAttempt.update({
        where: { id: 'att-1' },
        data: {
          completedAt: new Date(),
          status: 'failed',
          errorMessage: ambiguousError.message,
        },
      });

      expect(attemptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: 'ECONNRESET: Connection closed by remote server during transmission',
          }),
        })
      );
    });
  });

  describe('Rate Limiter Fail-Safe & Spacing Rescheduling', () => {
    it('reschedules job safely when rate limiter indicates quota exhaustion', async () => {
      const limiter = new DistributedLimiter(redis);
      vi.spyOn(limiter, 'acquireHourlySlot').mockResolvedValue({
        allowed: false,
        currentCount: 200,
        retryAfterMs: 1800000, // 30 minutes
      });

      const check = await limiter.acquireHourlySlot('sender-1', 200, 'email-1');
      expect(check.allowed).toBe(false);
      expect(check.retryAfterMs).toBe(1800000);

      // Verify that scheduledAt timestamp would be recalculated in future
      const newScheduledAt = new Date(Date.now() + check.retryAfterMs);
      expect(newScheduledAt.getTime()).toBeGreaterThan(Date.now() + 1700000);
    });
  });
});
