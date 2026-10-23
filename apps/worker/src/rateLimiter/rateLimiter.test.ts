import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistributedLimiter } from './distributedLimiter.js';

describe('DistributedLimiter', () => {
  let mockRedis: any;
  let limiter: DistributedLimiter;

  beforeEach(() => {
    mockRedis = {
      eval: vi.fn(),
      zrem: vi.fn().mockResolvedValue(1),
    };
    limiter = new DistributedLimiter(mockRedis);
  });

  describe('acquireHourlySlot', () => {
    it('returns allowed: true when limit is not exceeded', async () => {
      mockRedis.eval.mockResolvedValue([1, 5, 0]);

      const result = await limiter.acquireHourlySlot('sender-123', 200, 'email-abc');

      expect(result.allowed).toBe(true);
      expect(result.currentCount).toBe(5);
      expect(result.retryAfterMs).toBe(0);
      expect(mockRedis.eval).toHaveBeenCalled();
    });

    it('returns allowed: false and retryAfterMs when limit is exceeded', async () => {
      mockRedis.eval.mockResolvedValue([0, 200, 150000]);

      const result = await limiter.acquireHourlySlot('sender-123', 200, 'email-abc');

      expect(result.allowed).toBe(false);
      expect(result.currentCount).toBe(200);
      expect(result.retryAfterMs).toBe(150000);
    });
  });

  describe('checkSendSpacing', () => {
    it('returns allowed: true when spacing interval has elapsed', async () => {
      mockRedis.eval.mockResolvedValue([1, 0]);

      const result = await limiter.checkSendSpacing('sender-123', 2000);

      expect(result.allowed).toBe(true);
      expect(result.waitMs).toBe(0);
    });

    it('returns allowed: false and waitMs when within minimum interval', async () => {
      mockRedis.eval.mockResolvedValue([0, 1200]);

      const result = await limiter.checkSendSpacing('sender-123', 2000);

      expect(result.allowed).toBe(false);
      expect(result.waitMs).toBe(1200);
    });

    it('skips check if minIntervalMs is 0 or negative', async () => {
      const result = await limiter.checkSendSpacing('sender-123', 0);
      expect(result.allowed).toBe(true);
      expect(result.waitMs).toBe(0);
      expect(mockRedis.eval).not.toHaveBeenCalled();
    });
  });
});
