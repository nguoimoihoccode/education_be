import { RedisThrottlerStorage } from './throttler-redis.storage';

const createFakeRedis = () => {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  const fake = {
    store,
    incr: jest.fn(async (key: string) => {
      const entry = store.get(key);
      const value = entry ? Number(entry.value) + 1 : 1;
      store.set(key, {
        value: String(value),
        expiresAt: entry?.expiresAt ?? null,
      });
      return value;
    }),
    pexpire: jest.fn(async (key: string, ms: number) => {
      const entry = store.get(key);
      if (!entry) return 0;
      entry.expiresAt = Date.now() + ms;
      return 1;
    }),
    pttl: jest.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return -2;
      if (entry.expiresAt === null) return -1;
      return Math.max(0, entry.expiresAt - Date.now());
    }),
    set: jest.fn(
      async (key: string, value: string, _mode: string, ms: number) => {
        store.set(key, { value, expiresAt: Date.now() + ms });
        return 'OK';
      },
    ),
  };
  return fake;
};

describe('RedisThrottlerStorage', () => {
  const TTL = 60_000;
  const BLOCK = 60_000;

  it('counts hits in redis and does not block under the limit', async () => {
    const redis = createFakeRedis();
    const storage = new RedisThrottlerStorage(redis as never);

    const first = await storage.increment('key-1', TTL, 2, BLOCK, 'default');
    const second = await storage.increment('key-1', TTL, 2, BLOCK, 'default');

    expect(first).toMatchObject({ totalHits: 1, isBlocked: false });
    expect(second).toMatchObject({ totalHits: 2, isBlocked: false });
    expect(redis.incr).toHaveBeenCalledTimes(2);
    // Only the first hit sets the window expiry.
    expect(redis.pexpire).toHaveBeenCalledTimes(1);
  });

  it('blocks the request that exceeds the limit and sets a block key', async () => {
    const redis = createFakeRedis();
    const storage = new RedisThrottlerStorage(redis as never);

    await storage.increment('key-1', TTL, 1, BLOCK, 'default');
    const third = await storage.increment('key-1', TTL, 1, BLOCK, 'default');

    expect(third).toMatchObject({ totalHits: 2, isBlocked: true });
    expect(redis.set).toHaveBeenCalledWith(
      'throttle:key-1:default:block',
      '1',
      'PX',
      BLOCK,
    );
  });

  it('reports a blocked state without counting while the block key lives', async () => {
    const redis = createFakeRedis();
    const storage = new RedisThrottlerStorage(redis as never);

    await storage.increment('key-1', TTL, 0, BLOCK, 'default');
    redis.incr.mockClear();

    const blocked = await storage.increment('key-1', TTL, 0, BLOCK, 'default');

    expect(blocked).toMatchObject({
      totalHits: 1,
      isBlocked: true,
      timeToBlockExpire: expect.any(Number),
    });
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('re-arms the window expiry if the hit counter lost its TTL', async () => {
    const redis = createFakeRedis();
    const storage = new RedisThrottlerStorage(redis as never);

    await storage.increment('key-1', TTL, 10, BLOCK, 'default');
    // Simulate a lost expiry (crash between INCR and PEXPIRE).
    const entry = redis.store.get('throttle:key-1:default:hits')!;
    entry.expiresAt = null;

    await storage.increment('key-1', TTL, 10, BLOCK, 'default');

    expect(redis.pexpire).toHaveBeenCalledTimes(2);
  });

  it('falls back to in-memory counting when redis fails', async () => {
    const redis = createFakeRedis();
    redis.incr.mockRejectedValue(new Error('connection refused'));
    const storage = new RedisThrottlerStorage(redis as never);

    const first = await storage.increment('key-1', 10, 100, 10, 'default');
    const second = await storage.increment('key-1', 10, 100, 10, 'default');

    expect(first.totalHits).toBe(1);
    expect(second.totalHits).toBe(2);
    expect(second.isBlocked).toBe(false);
  });
});
