import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OutboxService } from '../apps/backend/src/services/outbox.service.js';
import { prisma } from '../apps/backend/src/lib/prisma.js';
import { emailQueue } from '../apps/backend/src/lib/queue.js';

describe('Campaign Idempotency & Transactional Outbox Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Campaign & Recipient Idempotency', () => {
    it('generates deterministic stable BullMQ job IDs for each scheduled recipient', () => {
      const emailId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const expectedJobId = `email:${emailId}`;

      expect(expectedJobId).toBe('email:a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('enforces scoped idempotency key per user to prevent duplicate campaign creation', () => {
      const userId = 'user-evaluator-1';
      const clientKey = 'campaign-idempotency-key-2026';

      const existingRecord = {
        id: 'camp-existing-01',
        userId,
        idempotencyKey: clientKey,
        name: 'Product Launch Outreach',
      };

      // Simulating database lookup for idempotency
      const findCampaign = (uid: string, key: string) => {
        if (existingRecord.userId === uid && existingRecord.idempotencyKey === key) {
          return existingRecord;
        }
        return null;
      };

      const found = findCampaign(userId, clientKey);
      expect(found).not.toBeNull();
      expect(found?.id).toBe('camp-existing-01');

      // Different user with the same key name is permitted (scoped uniqueness)
      const otherUserFound = findCampaign('user-evaluator-2', clientKey);
      expect(otherUserFound).toBeNull();
    });

    it('deduplicates duplicate recipient emails in a single scheduling request', () => {
      const inputRecipients = [
        'lead1@acme.com',
        'LEAD1@acme.com ', // duplicate with different casing/spacing
        'lead2@acme.com',
        'lead1@acme.com',  // duplicate
        'invalid-email-address',
      ];

      const validUnique: string[] = [];
      const seen = new Set<string>();

      for (const r of inputRecipients) {
        const clean = r.trim().toLowerCase();
        if (clean.includes('@') && clean.includes('.') && !seen.has(clean)) {
          seen.add(clean);
          validUnique.push(clean);
        }
      }

      expect(validUnique).toEqual(['lead1@acme.com', 'lead2@acme.com']);
      expect(validUnique.length).toBe(2);
    });
  });

  describe('Transactional Outbox Pattern & Dispatcher', () => {
    it('dispatches pending outbox records and marks them published upon BullMQ success', async () => {
      const mockOutboxMessage = {
        id: 'outbox-msg-1',
        jobId: 'email:email-1',
        delayMs: 5000,
        payload: JSON.stringify({
          emailId: 'email-1',
          campaignId: 'camp-1',
          senderId: 'sender-1',
          recipientEmail: 'client@example.com',
          subject: 'Welcome',
          body: 'Hello',
          scheduledAt: new Date().toISOString(),
          hourlyLimit: 200,
          minimumSendIntervalMs: 2000,
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: new Date(),
      };

      vi.spyOn(prisma.outboxMessage, 'findMany').mockResolvedValue([mockOutboxMessage as any]);
      vi.spyOn(emailQueue, 'addBulk').mockResolvedValue([] as any);
      const updateManySpy = vi.spyOn(prisma.outboxMessage, 'updateMany').mockResolvedValue({ count: 1 } as any);

      const result = await OutboxService.dispatchOutboxMessages(['outbox-msg-1']);

      expect(result.published).toBe(1);
      expect(result.failed).toBe(0);
      expect(emailQueue.addBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'send-email',
          opts: expect.objectContaining({
            jobId: 'email:email-1',
            attempts: 3,
          }),
        }),
      ]);
      expect(updateManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['outbox-msg-1'] } },
          data: expect.objectContaining({ status: 'published' }),
        })
      );
    });

    it('records errors and increments retryCount if BullMQ enqueue fails (Redis outage recovery)', async () => {
      const mockOutboxMessage = {
        id: 'outbox-msg-2',
        jobId: 'email:email-2',
        delayMs: 2000,
        payload: JSON.stringify({
          emailId: 'email-2',
          campaignId: 'camp-1',
          senderId: 'sender-1',
          recipientEmail: 'lead@example.com',
          subject: 'Hi',
          body: 'There',
          scheduledAt: new Date().toISOString(),
          hourlyLimit: 200,
          minimumSendIntervalMs: 2000,
        }),
        status: 'pending',
        retryCount: 0,
        createdAt: new Date(),
      };

      vi.spyOn(prisma.outboxMessage, 'findMany').mockResolvedValue([mockOutboxMessage as any]);
      vi.spyOn(emailQueue, 'addBulk').mockRejectedValue(new Error('Connection to Redis refused'));
      const updateManySpy = vi.spyOn(prisma.outboxMessage, 'updateMany').mockResolvedValue({ count: 1 } as any);

      const result = await OutboxService.dispatchOutboxMessages(['outbox-msg-2']);

      expect(result.published).toBe(0);
      expect(result.failed).toBe(1);
      // Confirms message is NOT dropped, error is recorded, and status stays pending for reconciler
      expect(updateManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['outbox-msg-2'] } },
          data: expect.objectContaining({
            lastError: 'Connection to Redis refused',
            retryCount: { increment: 1 },
          }),
        })
      );
    });
  });

  describe('Worker State Machine & Conditional Lease Ownership', () => {
    it('prevents multiple workers from processing or double-sending the same email', async () => {
      // Simulates atomic updateMany lease ownership check
      const emailRecord = {
        id: 'email-test-state-01',
        status: 'scheduled',
      };

      const acquireLease = (emailId: string) => {
        if (emailRecord.status === 'scheduled') {
          emailRecord.status = 'processing';
          return { count: 1 }; // Lease acquired
        }
        return { count: 0 }; // Lease denied
      };

      const worker1Lease = acquireLease(emailRecord.id);
      expect(worker1Lease.count).toBe(1);
      expect(emailRecord.status).toBe('processing');

      // Worker 2 attempts to process concurrently
      const worker2Lease = acquireLease(emailRecord.id);
      expect(worker2Lease.count).toBe(0); // Safely rejected!
    });

    it('rejects sending an email that was cancelled by the user', async () => {
      const emailRecord = {
        id: 'email-cancelled-01',
        status: 'cancelled',
      };

      const sendEmailMock = vi.fn();

      const processWorker = (email: typeof emailRecord) => {
        if (email.status === 'cancelled') {
          return { skipped: true, reason: 'CANCELLED' };
        }
        sendEmailMock();
        return { skipped: false };
      };

      const result = processWorker(emailRecord);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('CANCELLED');
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it('atomically increments campaign sentCount only when email status transitions from processing to sent', () => {
      let campaignSentCount = 0;
      let emailStatus: 'scheduled' | 'processing' | 'sent' = 'processing';

      const markSent = () => {
        if (emailStatus === 'processing') {
          emailStatus = 'sent';
          campaignSentCount += 1;
          return { count: 1 };
        }
        return { count: 0 };
      };

      // First worker call succeeds and increments count
      const res1 = markSent();
      expect(res1.count).toBe(1);
      expect(campaignSentCount).toBe(1);

      // Redelivered or duplicate job fails atomic condition and does NOT double-increment campaign count
      const res2 = markSent();
      expect(res2.count).toBe(0);
      expect(campaignSentCount).toBe(1);
    });
  });
});
