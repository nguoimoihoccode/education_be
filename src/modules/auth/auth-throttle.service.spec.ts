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
        async ({ where }: any) => rows.get(where.ipAddress) || null,
      ),
      create: jest.fn((partial: Partial<AuthLoginAttempt>) => ({
        attempts: 0,
        lastAttemptAt: new Date(),
        lockedUntil: null,
        ...partial,
      })),
      save: jest.fn(async (row: AuthLoginAttempt) => {
        rows.set(row.ipAddress, row);
        return row;
      }),
      delete: jest.fn(async () => {
        rows.delete(ipAddress);
        return { affected: 1, raw: [] };
      }),
      _peek: () => rows.get(ipAddress),
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

  it('keying is independent per ip address', async () => {
    await service.recordFailure(identifier, '9.9.9.9');
    expect(await service.getLockRemainingMs(identifier, ipAddress)).toBe(0);
  });
});
