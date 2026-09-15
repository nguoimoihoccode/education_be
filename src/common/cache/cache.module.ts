import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { CacheService } from './cache.service';

export const CACHE_REDIS_CLIENT = Symbol('CACHE_REDIS_CLIENT');

/**
 * Provides CacheService with a Redis client when REDIS_URL is configured.
 * Without REDIS_URL the service runs on the in-memory layer only, so local
 * development and single-instance deployments need no Redis at all.
 */
@Module({
  providers: [
    {
      provide: CACHE_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis | null => {
        const url = configService.get<string>('REDIS_URL');
        if (!url) {
          return null;
        }

        const client = new Redis(url, {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          retryStrategy: (times: number) => Math.min(times * 500, 5000),
        });
        // Command failures surface through CacheService's logging; without a
        // listener ioredis's 'error' events would print unhandled warnings.
        client.on('error', () => undefined);
        return client;
      },
    },
    {
      provide: CacheService,
      inject: [CACHE_REDIS_CLIENT],
      useFactory: (client: Redis | null) => new CacheService(client),
    },
  ],
  exports: [CacheService, CACHE_REDIS_CLIENT],
})
export class CacheModule {}
