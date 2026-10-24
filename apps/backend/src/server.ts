import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { emailQueue } from './lib/queue.js';
import { OutboxService } from './services/outbox.service.js';

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 InboxPilot Backend API listening on port ${env.PORT} in [${env.NODE_ENV}] mode`);
  logger.info(`📡 Health endpoints available at http://localhost:${env.PORT}/api/health`);
});

// Periodic Transactional Outbox Reconciler (every 5 seconds)
// Guarantees that any pending messages survive restarts, crashes, and Redis downtime
const outboxInterval = setInterval(() => {
  OutboxService.reconcileOutbox().catch((err) => {
    logger.warn(`Outbox reconciler error: ${err.message}`);
  });
}, 5000);

// Run initial outbox reconcile on boot
OutboxService.reconcileOutbox().catch(() => {});

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  clearInterval(outboxInterval);

  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      await emailQueue.close();
      logger.info('BullMQ email queue closed.');

      await redis.quit();
      logger.info('Redis connection closed.');

      await prisma.$disconnect();
      logger.info('Prisma database client disconnected.');

      logger.info('Graceful shutdown complete. Exiting.');
      process.exit(0);
    } catch (err: any) {
      logger.error('Error during graceful shutdown:', err.message);
      process.exit(1);
    }
  });

  // Force exit after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing exit.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
