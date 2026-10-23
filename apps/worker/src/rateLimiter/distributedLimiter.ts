import { Redis } from 'ioredis';
import { logger } from '../lib/logger.js';

// Lua script for atomic sliding window hourly rate limiting
const HOURLY_RATE_LIMIT_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_size_ms = tonumber(ARGV[2]) -- 3,600,000 ms (1 hour)
local limit = tonumber(ARGV[3])
local email_id = ARGV[4]

-- 1. Remove elements outside the sliding 1-hour window
local min_valid_time = now - window_size_ms
redis.call('ZREMRANGEBYSCORE', key, '-inf', min_valid_time)

-- 2. Count current sends within the window
local current_count = redis.call('ZCARD', key)

if current_count < limit then
  -- Slot available: reserve immediately
  redis.call('ZADD', key, now, email_id)
  redis.call('PEXPIRE', key, window_size_ms * 2)
  return {1, current_count + 1, 0}
else
  -- Limit exceeded: determine when the oldest send will expire out of the window
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local oldest_time = tonumber(oldest[2]) or (now - window_size_ms)
  local retry_after_ms = (oldest_time + window_size_ms) - now
  if retry_after_ms < 1000 then
    retry_after_ms = 1000
  end
  return {0, current_count, retry_after_ms}
end
`;

// Lua script for distributed per-sender minimum send spacing
const SEND_SPACING_LUA = `
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

-- Update last sent timestamp with safety TTL
local ttl = math.max(min_interval_ms * 5, 5000)
redis.call('SET', key, now, 'PX', ttl)
return {1, 0}
`;

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  retryAfterMs: number;
}

export interface SendSpacingCheckResult {
  allowed: boolean;
  waitMs: number;
}

export class DistributedLimiter {
  constructor(private redis: Redis) {}

  /**
   * Atomically acquires an hourly sending slot for a given sender
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
      };
    } catch (err: any) {
      logger.error(`Error executing hourly rate limit Lua script: ${err.message}`);
      // Fallback: in case of Redis script error, allow through to avoid stuck jobs
      return { allowed: true, currentCount: 0, retryAfterMs: 0 };
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
   * Atomically checks and enforces distributed minimum send interval between emails for a sender
   */
  async checkSendSpacing(
    senderId: string,
    minIntervalMs: number
  ): Promise<SendSpacingCheckResult> {
    if (minIntervalMs <= 0) {
      return { allowed: true, waitMs: 0 };
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
      };
    } catch (err: any) {
      logger.error(`Error executing send spacing Lua script: ${err.message}`);
      return { allowed: true, waitMs: 0 };
    }
  }
}
