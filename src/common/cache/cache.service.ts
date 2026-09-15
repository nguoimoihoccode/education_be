import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';

interface MemoryCacheEntry {
  expiresAt: number;
  raw: string;
}

const MEMORY_MAX_ENTRIES = 1000;
const MEMORY_SWEEP_TARGET = 900;
/** How long a value backfilled from Redis may live in the local layer. */
const REDIS_BACKFILL_MEMORY_TTL_SECONDS = 5;
const REDIS_ERROR_LOG_INTERVAL_MS = 30_000;

/**
 * Two-tier cache: an always-on in-memory layer plus an optional shared Redis
 * layer. Reads check memory first, then Redis; writes go to both. When Redis
 * is unreachable every command degrades to the memory layer instead of
 * failing the request.
 *
 * Values are JSON-serialized into both layers, so callers must treat cached
 * values as snapshots (Date fields come back as ISO strings, mutations to a
 * returned value are never persisted).
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly memory = new Map<string, MemoryCacheEntry>();
  private lastRedisErrorLoggedAt = 0;

  constructor(private readonly redis: Redis | null) {}

  async get<T>(key: string): Promise<T | undefined> {
    const local = this.memory.get(key);
    if (local) {
      if (local.expiresAt > Date.now()) {
        return JSON.parse(local.raw) as T;
      }
      this.memory.delete(key);
    }

    if (!this.redis) {
      return undefined;
    }

    try {
      const raw = await this.redis.get(key);
      if (raw === null) {
        return undefined;
      }
      // Backfill the local layer with a short TTL so cross-instance
      // invalidations surface within seconds, not the full entry TTL.
      this.memory.set(key, {
        expiresAt: Date.now() + REDIS_BACKFILL_MEMORY_TTL_SECONDS * 1000,
        raw,
      });
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logRedisFailure(error);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const raw = JSON.stringify(value);
    this.setMemory(key, raw, ttlSeconds);

    if (!this.redis || ttlSeconds <= 0) {
      return;
    }

    try {
      await this.redis.set(key, raw, 'EX', ttlSeconds);
    } catch (error) {
      this.logRedisFailure(error);
    }
  }

  async delete(key: string): Promise<void> {
    this.memory.delete(key);

    if (!this.redis) {
      return;
    }

    try {
      await this.redis.del(key);
    } catch (error) {
      this.logRedisFailure(error);
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.memory.keys()]) {
      if (key.startsWith(prefix)) {
        this.memory.delete(key);
      }
    }

    if (!this.redis) {
      return;
    }

    try {
      const stream = this.redis.scanStream({ match: `${prefix}*`, count: 100 });
      for await (const keys of stream) {
        if (Array.isArray(keys) && keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
    } catch (error) {
      this.logRedisFailure(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.redis) {
      return;
    }
    await this.redis.quit().catch(() => undefined);
  }

  private setMemory(key: string, raw: string, ttlSeconds: number): void {
    this.memory.set(key, {
      expiresAt: Date.now() + ttlSeconds * 1000,
      raw,
    });
    this.sweepMemoryIfFull();
  }

  private sweepMemoryIfFull(): void {
    if (this.memory.size <= MEMORY_MAX_ENTRIES) {
      return;
    }

    const now = Date.now();
    for (const [key, entry] of this.memory) {
      if (this.memory.size <= MEMORY_SWEEP_TARGET) {
        return;
      }
      if (entry.expiresAt <= now) {
        this.memory.delete(key);
      }
    }

    // Map preserves insertion order: evict oldest entries first.
    while (this.memory.size > MEMORY_SWEEP_TARGET) {
      const oldestKey = this.memory.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.memory.delete(oldestKey);
    }
  }

  private logRedisFailure(error: unknown): void {
    const now = Date.now();
    if (now - this.lastRedisErrorLoggedAt < REDIS_ERROR_LOG_INTERVAL_MS) {
      return;
    }
    this.lastRedisErrorLoggedAt = now;
    this.logger.warn(
      `Redis cache unavailable, serving from in-memory cache: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
