/**
 * Calculates the exact scheduled timestamp for recipient index i
 * scheduledAt(i) = startAt + i * delayBetweenEmailsMs
 */
export function calculateScheduledAt(
  startAt: Date | string | number,
  index: number,
  delayBetweenEmailsMs: number
): Date {
  const startDate = new Date(startAt);
  if (isNaN(startDate.getTime())) {
    throw new Error('Invalid startAt timestamp provided');
  }
  const offset = index * Math.max(0, delayBetweenEmailsMs);
  return new Date(startDate.getTime() + offset);
}

/**
 * Calculates the delay in milliseconds for BullMQ delayed jobs
 * delayMs = max(0, scheduledAt - now)
 */
export function calculateBullMQDelay(scheduledAt: Date | string | number, now: Date = new Date()): number {
  const targetDate = new Date(scheduledAt);
  if (isNaN(targetDate.getTime())) {
    return 0;
  }
  const diff = targetDate.getTime() - now.getTime();
  return Math.max(0, diff);
}

/**
 * Calculates the next rate-limit window timestamp when an hourly limit is exceeded
 * Returns the timestamp at the beginning of the next hour window plus a slight jitter to prevent thundering herd.
 */
export function calculateNextRateLimitWindow(now: Date = new Date()): Date {
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  // Add 500ms jitter to ensure the window has rolled over cleanly in distributed Redis clocks
  return new Date(nextHour.getTime() + 500);
}
