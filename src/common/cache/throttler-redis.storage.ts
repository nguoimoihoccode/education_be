import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { ThrottlerStorageService } from '@nestjs/throttler';

const ERROR_LOG_THROTTLE_MS = 30_000;

/**
 * Redis-backed throttler storage so rate limits are shared across every
 * backend instance instead of being per-process. When Redis is unreachable
 * the request falls back to the default in-memory storage (fail-open for
 * that instance) instead of erroring out.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly fallback = new ThrottlerStorageService();
  private lastErrorLogAt = 0;

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `throttle:${key}:${throttlerName}:hits`;
    const blockKey = `throttle:${key}:${throttlerName}:block`;

    try {
      const blockTtlMs = await this.redis.pttl(blockKey);
      if (blockTtlMs > 0) {
        // Still blocked: report an over-limit count so the guard throws.
        return {
          totalHits: limit + 1,
          timeToExpire: Math.ceil(ttl / 1000),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockTtlMs / 1000),
        };
      }

      const totalHits = await this.redis.incr(hitsKey);
      if (totalHits === 1) {
        await this.redis.pexpire(hitsKey, ttl);
      } else {
        // Guard against a lost expiry (e.g. crash between INCR and PEXPIRE)
        // so the counter can never stick around forever.
        const hitsTtlMs = await this.redis.pttl(hitsKey);
        if (hitsTtlMs < 0) {
          await this.redis.pexpire(hitsKey, ttl);
        }
      }

      const timeToExpire = Math.max(
        0,
        Math.ceil((await this.redis.pttl(hitsKey)) / 1000),
      );

      if (totalHits > limit) {
        await this.redis.set(blockKey, '1', 'PX', blockDuration);
        return {
          totalHits,
          timeToExpire,
          isBlocked: true,
          timeToBlockExpire: Math.ceil(blockDuration / 1000),
        };
      }

      return {
        totalHits,
        timeToExpire,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    } catch (error) {
      this.logFailure(error);
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  private logFailure(error: unknown): void {
    const now = Date.now();
    if (now - this.lastErrorLogAt < ERROR_LOG_THROTTLE_MS) {
      return;
    }
    this.lastErrorLogAt = now;
    this.logger.warn(
      `Redis throttler storage unavailable, falling back to in-memory: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
