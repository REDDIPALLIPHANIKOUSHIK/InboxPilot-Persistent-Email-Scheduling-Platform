import { describe, it, expect } from 'vitest';
import {
  calculateScheduledAt,
  calculateBullMQDelay,
  calculateNextRateLimitWindow,
} from './scheduleCalculator.js';

describe('calculateScheduledAt', () => {
  it('correctly calculates scheduledAt(i) = startAt + i * delayBetweenEmailsMs', () => {
    const base = new Date('2026-10-23T12:00:00.000Z');
    const delay = 5000; // 5 seconds

    const t0 = calculateScheduledAt(base, 0, delay);
    expect(t0.toISOString()).toBe('2026-10-23T12:00:00.000Z');

    const t1 = calculateScheduledAt(base, 1, delay);
    expect(t1.toISOString()).toBe('2026-10-23T12:00:05.000Z');

    const t10 = calculateScheduledAt(base, 10, delay);
    expect(t10.toISOString()).toBe('2026-10-23T12:00:50.000Z');
  });

  it('throws an error if startAt is invalid', () => {
    expect(() => calculateScheduledAt('invalid-date', 0, 1000)).toThrow();
  });
});

describe('calculateBullMQDelay', () => {
  it('calculates positive delay for future timestamps', () => {
    const now = new Date('2026-10-23T12:00:00.000Z');
    const scheduledAt = new Date('2026-10-23T12:00:30.000Z');

    const delay = calculateBullMQDelay(scheduledAt, now);
    expect(delay).toBe(30000);
  });

  it('returns 0 delay for past timestamps', () => {
    const now = new Date('2026-10-23T12:00:00.000Z');
    const scheduledAt = new Date('2026-10-23T11:59:00.000Z');

    const delay = calculateBullMQDelay(scheduledAt, now);
    expect(delay).toBe(0);
  });
});

describe('calculateNextRateLimitWindow', () => {
  it('rolls forward to the start of the next hour with jitter', () => {
    const now = new Date('2026-10-23T12:45:15.000Z');
    const nextWindow = calculateNextRateLimitWindow(now);

    expect(nextWindow.getMinutes()).toBe(0);
    expect(nextWindow.getSeconds()).toBe(0);
    expect(nextWindow.getMilliseconds()).toBe(500);
    expect(nextWindow.getTime()).toBeGreaterThan(now.getTime());
  });
});
