export const EMAIL_QUEUE_NAME = 'email-queue';
export const SEND_EMAIL_JOB_NAME = 'send-email';

export const DEFAULT_HOURLY_LIMIT = 200;
export const DEFAULT_MIN_SEND_INTERVAL_MS = 2000;
export const DEFAULT_WORKER_CONCURRENCY = 5;

export const EMAIL_STATUSES = {
  SCHEDULED: 'scheduled',
  PROCESSING: 'processing',
  SENT: 'sent',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export const CAMPAIGN_STATUSES = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
} as const;

export const DELIVERY_ATTEMPT_STATUSES = {
  SUCCESS: 'success',
  FAILED: 'failed',
} as const;
