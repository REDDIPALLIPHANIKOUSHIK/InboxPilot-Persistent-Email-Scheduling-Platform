import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { emailQueue } from '../lib/queue.js';

export const healthRouter = Router();

// GET /api/health - Liveness check
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// GET /api/health/ready - Readiness check
healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, { status: string; error?: string; latencyMs?: number }> = {};
  let isReady = true;

  // 1. PostgreSQL check
  const pgStart = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = { status: 'healthy', latencyMs: Date.now() - pgStart };
  } catch (err: any) {
    isReady = false;
    checks.postgres = { status: 'unhealthy', error: err.message };
  }

  // 2. Redis check
  const redisStart = Date.now();
  try {
    const ping = await redis.ping();
    checks.redis = {
      status: ping === 'PONG' ? 'healthy' : 'degraded',
      latencyMs: Date.now() - redisStart,
    };
    if (ping !== 'PONG') isReady = false;
  } catch (err: any) {
    isReady = false;
    checks.redis = { status: 'unhealthy', error: err.message };
  }

  // 3. BullMQ Queue check
  try {
    const counts = await emailQueue.getJobCounts('delayed', 'waiting', 'active', 'completed', 'failed');
    checks.bullmq = {
      status: 'healthy',
      ...counts,
    };
  } catch (err: any) {
    isReady = false;
    checks.bullmq = { status: 'unhealthy', error: err.message };
  }

  const statusCode = isReady ? 200 : 503;
  res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
});
