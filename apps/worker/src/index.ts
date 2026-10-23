import { createEmailWorker } from './worker.js';
import { logger } from './lib/logger.js';
import { redis } from './lib/redis.js';
import { prisma } from './lib/prisma.js';
import { getMailerTransporter } from './lib/mailer.js';

async function main() {
  logger.info('🚀 Starting InboxPilot BullMQ Worker Service...');

  // Initialize Ethereal transporter connection
  try {
    await getMailerTransporter();
  } catch (err: any) {
    logger.warn('Initial mailer check had issues, continuing with startup:', err.message);
  }

  const worker = createEmailWorker();

  // Graceful shutdown handling
  async function shutdown(signal: string) {
    logger.info(`Received ${signal}. Shutting down worker gracefully...`);
    try {
      await worker.close();
      logger.info('BullMQ worker closed.');

      await redis.quit();
      logger.info('Redis connection closed.');

      await prisma.$disconnect();
      logger.info('Prisma client disconnected.');

      logger.info('Worker shutdown complete. Exiting.');
      process.exit(0);
    } catch (err: any) {
      logger.error('Error during worker shutdown:', err.message);
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal error starting worker:', err);
  process.exit(1);
});
