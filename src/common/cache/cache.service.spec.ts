import type { Redis } from 'ioredis';
import { CacheService } from './cache.service';

const createFakeRedis = () => ({
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  scanStream: jest.fn(),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
});

describe('CacheService (memory backend)', () => {
  it('stores and returns values', async () => {
    const cache = new CacheService(null);

    await cache.set('key', { a: 1 }, 60);

    await expect(cache.get<{ a: number }>('key')).resolves.toEqual({ a: 1 });
  });

  it('drops entries once their TTL elapses', async () => {
    const cache = new CacheService(null);

    await cache.set('key', 'value', 0);

    await expect(cache.get('key')).resolves.toBeUndefined();
  });

  it('delete removes a single key', async () => {
    const cache = new CacheService(null);

    await cache.set('key', 'value', 60);
    await cache.delete('key');

    await expect(cache.get('key')).resolves.toBeUndefined();
  });

  it('deletePrefix removes only matching keys', async () => {
    const cache = new CacheService(null);

    await cache.set('prefix:a', 1, 60);
    await cache.set('prefix:b', 2, 60);
    await cache.set('other:c', 3, 60);
    await cache.deletePrefix('prefix:');

    await expect(cache.get('prefix:a')).resolves.toBeUndefined();
    await expect(cache.get('prefix:b')).resolves.toBeUndefined();
    await expect(cache.get('other:c')).resolves.toBe(3);
  });

  it('evicts oldest entries when the memory cap is reached', async () => {
    const cache = new CacheService(null);

    for (let i = 0; i < 1001; i += 1) {
      await cache.set(`key-${i}`, i, 60);
    }

    await expect(cache.get('key-0')).resolves.toBeUndefined();
    await expect(cache.get('key-1000')).resolves.toBe(1000);
  });
});

describe('CacheService (redis backend)', () => {
  it('writes through to redis and serves local hits without touching redis', async () => {
    const redis = createFakeRedis();
    const cache = new CacheService(redis as unknown as Redis);

    await cache.set('key', { a: 1 }, 60);
    await cache.get('key');
    await cache.get('key');

    expect(redis.set).toHaveBeenCalledWith(
      'key',
      JSON.stringify({ a: 1 }),
      'EX',
      60,
    );
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('reads through to redis on a local miss and backfills memory', async () => {
    const redis = createFakeRedis();
    redis.get.mockResolvedValue(JSON.stringify({ a: 1 }));
    const cache = new CacheService(redis as unknown as Redis);

    await expect(cache.get('key')).resolves.toEqual({ a: 1 });
    redis.get.mockResolvedValue(JSON.stringify({ a: 999 }));
    await expect(cache.get('key')).resolves.toEqual({ a: 1 });

    expect(redis.get).toHaveBeenCalledTimes(1);
  });

  it('degrades to the memory layer when redis commands fail', async () => {
    const redis = createFakeRedis();
    redis.get.mockRejectedValue(new Error('connection down'));
    redis.set.mockRejectedValue(new Error('connection down'));
    const cache = new CacheService(redis as unknown as Redis);

    await expect(cache.set('key', 'value', 60)).resolves.toBeUndefined();
    await expect(cache.get('key')).resolves.toBe('value');
  });

  it('delete removes from both layers', async () => {
    const redis = createFakeRedis();
    const cache = new CacheService(redis as unknown as Redis);

    await cache.set('key', 'value', 60);
    await cache.delete('key');

    expect(redis.del).toHaveBeenCalledWith('key');
    await expect(cache.get('key')).resolves.toBeUndefined();
  });

  it('deletePrefix scans redis and deletes every matching key', async () => {
    const redis = createFakeRedis();
    redis.scanStream.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield ['edu:catalog:languages', 'edu:catalog:courses:1:all:1:10'];
        yield [];
      },
    });
    const cache = new CacheService(redis as unknown as Redis);

    await cache.set('edu:catalog:languages', [], 60);
    await cache.deletePrefix('edu:catalog:');

    expect(redis.del).toHaveBeenCalledWith(
      'edu:catalog:languages',
      'edu:catalog:courses:1:all:1:10',
    );
    await expect(cache.get('edu:catalog:languages')).resolves.toBeUndefined();
  });

  it('quits the redis client on module destroy', async () => {
    const redis = createFakeRedis();
    const cache = new CacheService(redis as unknown as Redis);

    await cache.onModuleDestroy();

    expect(redis.quit).toHaveBeenCalledTimes(1);
  });
});
