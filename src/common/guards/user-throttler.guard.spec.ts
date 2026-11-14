import { UserThrottlerGuard } from './user-throttler.guard';

describe('UserThrottlerGuard', () => {
  const guard = Object.create(UserThrottlerGuard.prototype) as {
    getTracker(req: Record<string, unknown>): Promise<string>;
  };

  it('tracks a signed-in caller by account so rotating IPs does not reset the limit', async () => {
    expect(await guard.getTracker({ user: { id: 7 }, ip: '1.1.1.1' })).toBe(
      'user:7',
    );
    expect(await guard.getTracker({ user: { id: 7 }, ip: '2.2.2.2' })).toBe(
      'user:7',
    );
    expect(await guard.getTracker({ user: { sub: 9 }, ip: '2.2.2.2' })).toBe(
      'user:9',
    );
  });

  it('falls back to the client address for anonymous requests', async () => {
    expect(await guard.getTracker({ ip: '3.3.3.3' })).toBe('3.3.3.3');
    expect(await guard.getTracker({ ips: ['4.4.4.4'], ip: '3.3.3.3' })).toBe(
      '4.4.4.4',
    );
  });
});

describe('UserThrottlerGuard blocked requests', () => {
  it('logs the account and route without the query string, then still rejects', async () => {
    const guard = Object.create(UserThrottlerGuard.prototype) as {
      logger: { warn: jest.Mock };
      getErrorMessage: () => Promise<string>;
      throwThrottlingException(
        context: unknown,
        detail: unknown,
      ): Promise<void>;
    };
    guard.logger = { warn: jest.fn() };
    guard.getErrorMessage = () => Promise.resolve('Too Many Requests');
    const req = {
      method: 'GET',
      route: { path: '/assessments/:assessmentId/pages/:pageId/content' },
      originalUrl: '/assessments/a/pages/p/content?token=secret',
    };
    const context = { switchToHttp: () => ({ getRequest: () => req }) };
    await expect(
      guard.throwThrottlingException(context, {
        tracker: 'user:7',
        limit: 120,
        ttl: 60000,
        totalHits: 121,
        key: 'k',
      }),
    ).rejects.toThrow('Too Many Requests');
    const line = guard.logger.warn.mock.calls[0][0] as string;
    expect(line).toContain('tracker=user:7');
    expect(line).toContain(
      'route=/assessments/:assessmentId/pages/:pageId/content',
    );
    expect(line).not.toContain('secret');
  });
});
