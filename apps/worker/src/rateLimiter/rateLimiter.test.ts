import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributedLimiter } from './distributedLimiter.js';

describe('DistributedLimiter', () => {
  let mockRedis: any;
  let limiter: DistributedLimiter;

  beforeEach(() => {
    mockRedis = {
      eval: vi.fn(),
      zrem: vi.fn().mockResolvedValue(1),
      del: vi.fn().mockResolvedValue(1),
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zcard: vi.fn().mockResolvedValue(0),
    };
    limiter = new DistributedLimiter(mockRedis);
  });

  describe('Hourly Rate Limiting (Atomic Sliding Window)', () => {
    it('allows send and reserves slot when hourly limit is not exceeded', async () => {
      mockRedis.eval.mockResolvedValue([1, 15, 0]);

      const result = await limiter.acquireHourlySlot('sender-marketing-01', 200, 'email-uuid-1');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(15);
      expect(result.retryAfterMs).toBe(0);
      expect(result.isError).toBe(false);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'ratelimit:hourly:sender-marketing-01',
        expect.any(Number),
        3600000,
        200,
        'email-uuid-1'
      );
    });

    it('rejects send and computes retryAfterMs when hourly limit is reached', async () => {
      mockRedis.eval.mockResolvedValue([0, 200, 180000]); // 200/200 reached, retry in 3 min

      const result = await limiter.acquireHourlySlot('sender-marketing-01', 200, 'email-uuid-201');

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(200);
      expect(result.retryAfterMs).toBe(180000);
      expect(result.isError).toBe(false);
    });

    it('FAILS SAFE: Redis unavailable / connection error never allows an unmetered email to be sent', async () => {
      mockRedis.eval.mockRejectedValue(new Error('ECONNREFUSED: Connection to Redis failed'));

      const result = await limiter.acquireHourlySlot('sender-critical-01', 100, 'email-uuid-999');

      // CRITICAL: Must NEVER fail-open! Must return allowed: false
      expect(result.allowed).toBe(false);
      expect(result.isError).toBe(true);
      expect(result.retryAfterMs).toBeGreaterThan(0); // Safe backoff
    });

    it('FAILS SAFE: Redis Lua execution error fails safely and does not allow send', async () => {
      mockRedis.eval.mockRejectedValue(new Error('NOSCRIPT No matching script. Please use EVAL.'));

      const result = await limiter.acquireHourlySlot('sender-critical-01', 100, 'email-uuid-888');

      expect(result.allowed).toBe(false);
      expect(result.isError).toBe(true);
    });

    it('releases reservation if sending fails before network transmission', async () => {
      await limiter.releaseHourlySlot('sender-marketing-01', 'email-uuid-1');

      expect(mockRedis.zrem).toHaveBeenCalledWith(
        'ratelimit:hourly:sender-marketing-01',
        'email-uuid-1'
      );
    });

    it('coordinates multiple concurrent worker requests targeting the same sender key', async () => {
      // Simulate 3 concurrent workers acquiring slots for the same sender
      mockRedis.eval
        .mockResolvedValueOnce([1, 199, 0]) // Worker 1 gets 199th slot
        .mockResolvedValueOnce([1, 200, 0]) // Worker 2 gets 200th slot
        .mockResolvedValueOnce([0, 200, 45000]); // Worker 3 exceeds limit, must retry in 45s

      const [res1, res2, res3] = await Promise.all([
        limiter.acquireHourlySlot('sender-shared-01', 200, 'email-job-1'),
        limiter.acquireHourlySlot('sender-shared-01', 200, 'email-job-2'),
        limiter.acquireHourlySlot('sender-shared-01', 200, 'email-job-3'),
      ]);

      expect(res1.allowed).toBe(true);
      expect(res2.allowed).toBe(true);
      expect(res3.allowed).toBe(false);
      expect(res3.retryAfterMs).toBe(45000);
    });

    it('isolates rate-limit keys across multiple sender identities', async () => {
      mockRedis.eval
        .mockResolvedValueOnce([1, 10, 0])
        .mockResolvedValueOnce([1, 5, 0]);

      await limiter.acquireHourlySlot('sender-alpha', 100, 'email-a');
      await limiter.acquireHourlySlot('sender-beta', 50, 'email-b');

      expect(mockRedis.eval).toHaveBeenNthCalledWith(
        1,
        expect.any(String),
        1,
        'ratelimit:hourly:sender-alpha',
        expect.any(Number),
        3600000,
        100,
        'email-a'
      );

      expect(mockRedis.eval).toHaveBeenNthCalledWith(
        2,
        expect.any(String),
        1,
        'ratelimit:hourly:sender-beta',
        expect.any(Number),
        3600000,
        50,
        'email-b'
      );
    });
  });

  describe('Send Spacing Limiting (Distributed Interval Coordination)', () => {
    it('allows dispatch when minimum send interval has passed', async () => {
      mockRedis.eval.mockResolvedValue([1, 0]);

      const result = await limiter.checkSendSpacing('sender-sales-01', 2000);

      expect(result.allowed).toBe(true);
      expect(result.waitMs).toBe(0);
      expect(result.isError).toBe(false);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'spacing:sender:sender-sales-01',
        expect.any(Number),
        2000
      );
    });

    it('returns allowed: false and waitMs when within minimum interval', async () => {
      mockRedis.eval.mockResolvedValue([0, 1450]);

      const result = await limiter.checkSendSpacing('sender-sales-01', 2000);

      expect(result.allowed).toBe(false);
      expect(result.waitMs).toBe(1450);
      expect(result.isError).toBe(false);
    });

    it('FAILS SAFE: Redis error during send spacing check re-delays rather than bursting sends', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection lost'));

      const result = await limiter.checkSendSpacing('sender-sales-01', 2000);

      expect(result.allowed).toBe(false);
      expect(result.isError).toBe(true);
      expect(result.waitMs).toBeGreaterThanOrEqual(2000);
    });

    it('skips check if minIntervalMs is 0 or negative', async () => {
      const result = await limiter.checkSendSpacing('sender-sales-01', 0);
      expect(result.allowed).toBe(true);
      expect(result.waitMs).toBe(0);
      expect(mockRedis.eval).not.toHaveBeenCalled();
    });
  });
});
