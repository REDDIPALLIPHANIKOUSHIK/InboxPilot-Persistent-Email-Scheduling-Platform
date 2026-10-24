import { Redis } from 'ioredis';
import { logger } from '../lib/logger.js';

// Lua script for atomic sliding window hourly rate limiting
// Guaranteed: All workers evaluate against the same sorted set in Redis
export const HOURLY_RATE_LIMIT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_size_ms = tonumber(ARGV[2]) -- 3,600,000 ms (1 hour)
local limit = tonumber(ARGV[3])
local email_id = ARGV[4]

-- 1. Purge entries older than the sliding 1-hour window
local min_valid_time = now - window_size_ms
redis.call('ZREMRANGEBYSCORE', key, '-inf', min_valid_time)

-- 2. Count current dispatches in this sliding window
local current_count = redis.call('ZCARD', key)

if current_count < limit then
  -- Available quota: atomically record reservation
  redis.call('ZADD', key, now, email_id)
  redis.call('PEXPIRE', key, window_size_ms * 2)
  return {1, current_count + 1, 0}
else
  -- Quota exhausted: find oldest timestamp to compute exact time until next slot opens
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldest_time = (oldest and oldest[2]) and tonumber(oldest[2]) or (now - window_size_ms)
  local retry_after_ms = (oldest_time + window_size_ms) - now
  if retry_after_ms < 1000 then
    retry_after_ms = 1000
  end
  return {0, current_count, retry_after_ms}
end
`;

// Lua script for distributed per-sender minimum send spacing
// Atomically checks if enough time has passed since last dispatch
export const SEND_SPACING_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local min_interval_ms = tonumber(ARGV[2])

local last_sent = redis.call('GET', key)
if last_sent then
  local diff = now - tonumber(last_sent)
  if diff < min_interval_ms then
    local wait_ms = min_interval_ms - diff
    return {0, wait_ms}
  end
end

-- Atomically update last sent timestamp with safe TTL
local ttl = math.max(min_interval_ms * 5, 10000)
redis.call('SET', key, now, 'PX', ttl)
return {1, 0}
`;

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  retryAfterMs: number;
  isError?: boolean;
}

export interface SendSpacingCheckResult {
  allowed: boolean;
  waitMs: number;
  isError?: boolean;
}

export class DistributedLimiter {
  constructor(private redis: Redis) {}

  /**
   * Atomically acquires an hourly sending slot for a given sender identity.
   * STRICT FAIL-SAFE: If Redis fails or is unavailable, requests are NOT allowed through.
   * Instead, allowed=false is returned with a backoff so BullMQ safely re-delays the job.
   */
  async acquireHourlySlot(
    senderId: string,
    hourlyLimit: number,
    emailId: string
  ): Promise<RateLimitCheckResult> {
    const key = `ratelimit:hourly:${senderId}`;
    const now = Date.now();
    const oneHourMs = 3600 * 1000;

    try {
      const res = (await this.redis.eval(
        HOURLY_RATE_LIMIT_LUA,
        1,
        key,
        now,
        oneHourMs,
        hourlyLimit,
        emailId
      )) as [number, number, number];

      const allowed = res[0] === 1;
      const currentCount = res[1];
      const retryAfterMs = res[2];

      return {
        allowed,
        currentCount,
        retryAfterMs,
        isError: false,
      };
    } catch (err: any) {
      logger.error(
        `[RATE-LIMIT] Redis failure during hourly rate limit check for sender ${senderId}: ${err.message}. Failing safe.`
      );
      // STRICT FAIL-SAFE: NEVER allow un-metered dispatch on Redis failure!
      return {
        allowed: false,
        currentCount: -1,
        retryAfterMs: 5000, // 5s backoff for Redis recovery
        isError: true,
      };
    }
  }

  /**
   * Release reservation if sending failed before network transmission
   */
  async releaseHourlySlot(senderId: string, emailId: string): Promise<void> {
    const key = `ratelimit:hourly:${senderId}`;
    try {
      await this.redis.zrem(key, emailId);
      logger.debug(`Released rate limit reservation for email ${emailId}`);
    } catch (err: any) {
      logger.warn(`Failed to release rate limit slot: ${err.message}`);
    }
  }

  /**
   * Atomically checks and enforces distributed minimum send interval between emails for a sender.
   * STRICT FAIL-SAFE: If Redis fails, does not allow uncoordinated dispatches.
   */
  async checkSendSpacing(
    senderId: string,
    minIntervalMs: number
  ): Promise<SendSpacingCheckResult> {
    if (minIntervalMs <= 0) {
      return { allowed: true, waitMs: 0, isError: false };
    }

    const key = `spacing:sender:${senderId}`;
    const now = Date.now();

    try {
      const res = (await this.redis.eval(
        SEND_SPACING_LUA,
        1,
        key,
        now,
        minIntervalMs
      )) as [number, number];

      const allowed = res[0] === 1;
      const waitMs = res[1];

      return {
        allowed,
        waitMs,
        isError: false,
      };
    } catch (err: any) {
      logger.error(
        `[SPACING] Redis failure during send spacing check for sender ${senderId}: ${err.message}. Failing safe.`
      );
      // STRICT FAIL-SAFE: Re-delay so workers don't burst concurrent sends
      return {
        allowed: false,
        waitMs: Math.max(minIntervalMs, 2000),
        isError: true,
      };
    }
  }

  /**
   * Clears send spacing for a sender (used in testing and maintenance)
   */
  async clearSendSpacing(senderId: string): Promise<void> {
    const key = `spacing:sender:${senderId}`;
    try {
      await this.redis.del(key);
    } catch (err: any) {
      logger.warn(`Failed to clear send spacing: ${err.message}`);
    }
  }

  /**
   * Gets current count of sends in the active sliding window for a sender
   */
  async getCurrentCount(senderId: string, windowSizeMs: number = 3600000): Promise<number> {
    const key = `ratelimit:hourly:${senderId}`;
    const now = Date.now();
    try {
      await this.redis.zremrangebyscore(key, '-inf', now - windowSizeMs);
      return await this.redis.zcard(key);
    } catch {
      return 0;
    }
  }
}
