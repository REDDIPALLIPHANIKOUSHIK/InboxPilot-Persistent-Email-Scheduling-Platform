import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { emailQueue } from '../lib/queue.js';
import { OutboxService } from '../services/outbox.service.js';

describe('Email Endpoints & Service Suite', () => {
  const mockUser = {
    id: 'user-audit-123',
    email: 'dev@inboxpilot.local',
    name: 'Audit Engineer',
    googleId: 'google-audit-123',
    avatarUrl: null,
  };

  const mockSender = {
    id: 'sender-audit-456',
    userId: mockUser.id,
    name: 'Growth Lead',
    email: 'growth@inboxpilot.local',
    isDefault: true,
    hourlyLimit: 200,
    minimumSendIntervalMs: 2000,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const authToken = jwt.sign(mockUser, env.JWT_SECRET);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);
    vi.spyOn(prisma.campaign, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.sender, 'findFirst').mockResolvedValue(mockSender as any);
    vi.spyOn(prisma.email, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.email, 'findMany').mockResolvedValue([]);
    vi.spyOn(emailQueue, 'getJob').mockResolvedValue(undefined as any);
  });

  describe('Authentication Guards', () => {
    it('POST /api/emails/schedule rejects unauthenticated requests with 401', async () => {
      const res = await request(app).post('/api/emails/schedule').send({
        subject: 'Test Subject',
        body: 'Test Body',
        recipients: ['test@inboxpilot.local'],
        startAt: new Date(Date.now() + 60000).toISOString(),
        delayBetweenEmailsMs: 1000,
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/emails/scheduled rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/emails/scheduled');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/emails/sent rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/emails/sent');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Validation & Payload Enforcement', () => {
    it('rejects scheduling payload with missing subject', async () => {
      const res = await request(app)
        .post('/api/emails/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          body: 'Hello World',
          recipients: ['user@example.com'],
          startAt: new Date(Date.now() + 60000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects scheduling payload with missing body', async () => {
      const res = await request(app)
        .post('/api/emails/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Special Offer',
          recipients: ['user@example.com'],
          startAt: new Date(Date.now() + 60000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects scheduling with invalid recipient email syntax', async () => {
      const res = await request(app)
        .post('/api/emails/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Special Offer',
          body: 'Hello World',
          recipients: ['not-an-email'],
          startAt: new Date(Date.now() + 60000).toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects scheduling with a startAt timestamp in the past', async () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      const res = await request(app)
        .post('/api/emails/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          subject: 'Flash Sale',
          body: 'Limited time offer',
          recipients: ['lead@example.com'],
          startAt: pastTime,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('PAST_SCHEDULING_TIME');
    });
  });

  describe('Transactional Scheduling & Idempotency', () => {
    it('successfully schedules a campaign and dispatches outbox events', async () => {
      vi.spyOn(prisma.sender, 'findFirst').mockResolvedValue(mockSender as any);

      const fakeCampaign = {
        id: 'camp-created-1',
        userId: mockUser.id,
        senderId: mockSender.id,
        name: 'Launch Campaign',
        subject: 'Welcome to InboxPilot',
        body: 'Zero dropped jobs guaranteed.',
        startAt: new Date(Date.now() + 120000),
        idempotencyKey: 'idem-key-01',
        delayBetweenEmailsMs: 2000,
        hourlyLimit: 200,
        status: 'active',
        totalEmails: 2,
        sentCount: 0,
        failedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: mockSender,
      };

      vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
        const tx = {
          campaign: { create: vi.fn().mockResolvedValue(fakeCampaign) },
          email: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
          outboxMessage: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
        };
        return cb(tx);
      });

      vi.spyOn(OutboxService, 'dispatchOutboxMessages').mockResolvedValue({ published: 2, failed: 0 });

      const res = await request(app)
        .post('/api/emails/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Launch Campaign',
          subject: 'Welcome to InboxPilot',
          body: 'Zero dropped jobs guaranteed.',
          recipients: ['alpha@example.com', 'beta@example.com'],
          startAt: new Date(Date.now() + 120000).toISOString(),
          delayBetweenEmailsMs: 2000,
          idempotencyKey: 'idem-key-01',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalAccepted).toBe(2);
      expect(res.body.data.campaign.name).toBe('Launch Campaign');
    });

    it('returns existing campaign when matching idempotency key is submitted', async () => {
      const existingCampaign = {
        id: 'camp-existing-99',
        userId: mockUser.id,
        senderId: mockSender.id,
        name: 'Existing Campaign',
        subject: 'Already Scheduled',
        body: 'Persistent body',
        startAt: new Date(Date.now() + 300000),
        idempotencyKey: 'duplicate-key-123',
        delayBetweenEmailsMs: 1000,
        hourlyLimit: 200,
        status: 'active',
        totalEmails: 1,
        sentCount: 0,
        failedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        sender: mockSender,
      };

      vi.spyOn(prisma.sender, 'findFirst').mockResolvedValue(mockSender as any);
      vi.spyOn(prisma.campaign, 'findFirst').mockResolvedValue(existingCampaign as any);
      vi.spyOn(prisma.email, 'findMany').mockResolvedValue([
        {
          id: 'email-1',
          scheduledAt: existingCampaign.startAt,
        } as any,
      ]);

      const res = await request(app)
        .post('/api/emails/schedule')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Existing Campaign',
          subject: 'Already Scheduled',
          body: 'Persistent body',
          recipients: ['user@example.com'],
          startAt: new Date(Date.now() + 300000).toISOString(),
          idempotencyKey: 'duplicate-key-123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.campaign.id).toBe('camp-existing-99');
    });
  });

  describe('Email Cancellation & Safe Lifecycle Transitions', () => {
    it('cancels a scheduled email and removes job from queue', async () => {
      const mockEmail = {
        id: 'email-to-cancel-1',
        userId: mockUser.id,
        status: 'scheduled',
        bullmqJobId: 'email:email-to-cancel-1',
      };

      vi.spyOn(prisma.email, 'findFirst').mockResolvedValue(mockEmail as any);
      vi.spyOn(prisma.email, 'update').mockResolvedValue({ ...mockEmail, status: 'cancelled' } as any);

      const mockJob = { remove: vi.fn().mockResolvedValue(undefined) };
      vi.spyOn(emailQueue, 'getJob').mockResolvedValue(mockJob as any);

      const res = await request(app)
        .post('/api/emails/email-to-cancel-1/cancel')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');
      expect(mockJob.remove).toHaveBeenCalled();
    });

    it('rejects cancellation if the email has already been sent', async () => {
      const mockSentEmail = {
        id: 'email-already-sent',
        userId: mockUser.id,
        status: 'sent',
      };

      vi.spyOn(prisma.email, 'findFirst').mockResolvedValue(mockSentEmail as any);

      const res = await request(app)
        .post('/api/emails/email-already-sent/cancel')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ALREADY_SENT');
    });
  });
});
