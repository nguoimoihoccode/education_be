import { Repository } from 'typeorm';
import { AuthLoginAttempt } from './entities/auth-login-attempt.entity';
import {
  AuthThrottleService,
  lockDurationMs,
  normalizeIdentifier,
} from './auth-throttle.service';

describe('lockDurationMs (escalating lockout)', () => {
  it.each([
    [0, 0],
    [1, 0],
    [4, 0],
    [5, 15 * 60_000],
    [9, 15 * 60_000],
    [10, 3_600_000],
    [14, 3_600_000],
    [15, 12 * 3_600_000],
    [19, 12 * 3_600_000],
    [20, 24 * 3_600_000],
    [50, 24 * 3_600_000],
  ])('attempts=%i => %i ms', (attempts, expected) => {
    expect(lockDurationMs(attempts)).toBe(expected);
  });
});

describe('normalizeIdentifier', () => {
  it('trims and lowercases', () => {
    expect(normalizeIdentifier('  Foo@Bar.COM  ')).toBe('foo@bar.com');
  });
});

describe('AuthThrottleService', () => {
  const ipAddress = '1.2.3.4';
  const identifier = 'alice@example.com';

  const makeMockRepo = () => {
    const rows = new Map<string, AuthLoginAttempt>();
    return {
      findOne: jest.fn(
        async ({ where }: any) => rows.get(where.identifier) || null,
      ),
      create: jest.fn((partial: Partial<AuthLoginAttempt>) => ({
        attempts: 0,
        lastAttemptAt: new Date(),
        lockedUntil: null,
        ...partial,
      })),
      save: jest.fn(async (row: AuthLoginAttempt) => {
        rows.set(row.identifier, row);
        return row;
      }),
      delete: jest.fn(async ({ identifier }: any) => {
        rows.delete(identifier);
        return { affected: 1, raw: [] };
      }),
      _peek: () => rows.get(identifier),
    };
  };

  let repo: ReturnType<typeof makeMockRepo>;
  let service: AuthThrottleService;

  beforeEach(() => {
    repo = makeMockRepo();
    service = new AuthThrottleService(
      repo as unknown as Repository<AuthLoginAttempt>,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('returns 0 remaining when never attempted', async () => {
    expect(await service.getLockRemainingMs(identifier, ipAddress)).toBe(0);
  });

  it('locks for 15 minutes after 5 failures', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 5; i++) {
      await service.recordFailure(identifier, ipAddress);
    }
    const remaining = await service.getLockRemainingMs(identifier, ipAddress);
    expect(remaining).toBeGreaterThan(14 * 60_000);
    expect(repo._peek()?.lockedUntil).not.toBeNull();
  });

  it('does not lock before 5 failures', async () => {
    await service.recordFailure(identifier, ipAddress);
    expect(await service.getLockRemainingMs(identifier, ipAddress)).toBe(0);
    expect(repo._peek()?.lockedUntil).toBeNull();
  });

  it('escalates to 1 hour at 10 failures', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 10; i++) {
      await service.recordFailure(identifier, ipAddress);
    }
    const remaining = await service.getLockRemainingMs(identifier, ipAddress);
    expect(remaining).toBeGreaterThan(59 * 60_000);
  });

  it('returns 0 once the lock has expired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 5; i++) {
      await service.recordFailure(identifier, ipAddress);
    }
    jest.setSystemTime(new Date('2026-01-01T00:30:00Z'));
    expect(await service.getLockRemainingMs(identifier, ipAddress)).toBe(0);
  });

  it('clearFailures removes the row', async () => {
    await service.recordFailure(identifier, ipAddress);
    await service.clearFailures(identifier, ipAddress);
    expect(repo._peek()).toBeUndefined();
    expect(await service.getLockRemainingMs(identifier, ipAddress)).toBe(0);
  });

  it('keeps counting across IP addresses', async () => {
    for (let i = 0; i < 5; i++) {
      await service.recordFailure(identifier, `10.0.0.${i}`);
    }
    // The whole point of keying on the identifier: a new address must not hand
    // the attacker a fresh counter.
    expect(
      await service.getLockRemainingMs(identifier, '203.0.113.9'),
    ).toBeGreaterThan(0);
  });

  it('records the last failing address for review', async () => {
    await service.recordFailure(identifier, '10.0.0.1');
    await service.recordFailure(identifier, '10.0.0.2');
    expect(repo._peek()?.ipAddress).toBe('10.0.0.2');
    expect(repo._peek()?.attempts).toBe(2);
  });

  it('forgets old failures after a day of silence', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    for (let i = 0; i < 4; i++) {
      await service.recordFailure(identifier, ipAddress);
    }
    jest.setSystemTime(new Date('2026-01-03T00:00:00Z'));
    await service.recordFailure(identifier, ipAddress);
    // One slip today, not the fifth of a stale run: no lock, counter at 1.
    expect(repo._peek()?.attempts).toBe(1);
    expect(repo._peek()?.lockedUntil).toBeNull();
  });
});
