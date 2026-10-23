import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { emailQueue } from '../lib/queue.js';

describe('Health Endpoints', () => {
  it('GET /api/health returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });

  it('GET /api/health/ready checks dependencies', async () => {
    vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ 1: 1 }] as any);
    vi.spyOn(redis, 'ping').mockResolvedValue('PONG');
    vi.spyOn(emailQueue, 'getJobCounts').mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0,
      prioritized: 0,
      'waiting-children': 0,
    } as any);

    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.postgres.status).toBe('healthy');
    expect(res.body.checks.redis.status).toBe('healthy');
    expect(res.body.checks.bullmq.status).toBe('healthy');
  });
});
