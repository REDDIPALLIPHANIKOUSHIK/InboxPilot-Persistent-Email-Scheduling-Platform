import { Queue } from 'bullmq';
import { EMAIL_QUEUE_NAME } from '@inboxpilot/shared';
import { redis } from './redis.js';
import { logger } from './logger.js';

export const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 24 * 3600, // keep completed jobs for 24h
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // keep failed jobs for 7 days
    },
  },
});

emailQueue.on('error', (err) => {
  logger.error('BullMQ Email Queue error:', err.message);
});
