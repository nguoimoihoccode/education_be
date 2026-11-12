import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthLoginAttempt } from './entities/auth-login-attempt.entity';

const FIFTEEN_MINUTES_MS = 15 * 60_000;
const ONE_HOUR_MS = 3_600_000;
const TWELVE_HOURS_MS = 12 * ONE_HOUR_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export const LOCK_THRESHOLD = 5;

/** Silence longer than this starts the escalation ladder over. */
const ATTEMPT_DECAY_MS = ONE_DAY_MS;

export function lockDurationMs(attempts: number): number {
  if (attempts >= 20) return ONE_DAY_MS;
  if (attempts >= 15) return TWELVE_HOURS_MS;
  if (attempts >= 10) return ONE_HOUR_MS;
  if (attempts >= LOCK_THRESHOLD) return FIFTEEN_MINUTES_MS;
  return 0;
}

export const normalizeIdentifier = (identifier: string): string =>
  identifier.trim().toLowerCase();

@Injectable()
export class AuthThrottleService {
  constructor(
    @InjectRepository(AuthLoginAttempt)
    private readonly repository: Repository<AuthLoginAttempt>,
  ) {}

  /**
   * One counter per identifier, not per (identifier, IP).
   *
   * Keying on the address meant a caller could reset its own bucket by sending
   * a different X-Forwarded-For -- and, once that hole is closed, it still
   * meant an attack spread over many addresses never added up: five attempts
   * per IP, unlimited IPs, so a single account could be guessed forever. The
   * price is that someone who knows an address can lock that account; the
   * escalating ladder below bounds how useful that is, and a CAPTCHA on the
   * login form is the usual next step if lock-holder noise shows up.
   */
  private getKey(identifier: string) {
    return { identifier: normalizeIdentifier(identifier) };
  }

  async getLockRemainingMs(
    identifier: string,
    ipAddress?: string | null,
  ): Promise<number> {
    void ipAddress; // The address no longer takes part in the key.
    const row = await this.repository.findOne({
      where: this.getKey(identifier),
    });
    if (!row?.lockedUntil) {
      return 0;
    }
    return Math.max(0, row.lockedUntil.getTime() - Date.now());
  }

  async recordFailure(
    identifier: string,
    ipAddress?: string | null,
  ): Promise<void> {
    const key = this.getKey(identifier);
    const row = await this.repository.findOne({ where: key });
    const target =
      row ??
      this.repository.create({
        ...key,
        ipAddress: ipAddress || 'unknown',
        attempts: 0,
        lastAttemptAt: new Date(),
        lockedUntil: null,
      });
    this.applyFailure(target, ipAddress);
    try {
      await this.repository.save(target);
    } catch (error) {
      // Two first failures for one identifier can race on the insert; the
      // unique index rejects the loser. Count on the row the winner created
      // instead of turning a wrong-password retry into a 500.
      if (row || !this.isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.repository.findOne({ where: key });
      if (!existing) {
        throw error;
      }
      this.applyFailure(existing, ipAddress);
      await this.repository.save(existing);
    }
  }

  private applyFailure(row: AuthLoginAttempt, ipAddress?: string | null): void {
    // Informational only: the last address that failed, useful when reviewing
    // a lockout. It is never matched against.
    row.ipAddress = ipAddress || row.ipAddress;
    // Without a decay an old slip keeps escalating forever: four typos last
    // month plus one today would land on the 12-hour rung. A quiet day starts
    // the ladder over.
    if (
      row.attempts > 0 &&
      Date.now() - row.lastAttemptAt.getTime() > ATTEMPT_DECAY_MS
    ) {
      row.attempts = 0;
      row.lockedUntil = null;
    }
    row.attempts += 1;
    row.lastAttemptAt = new Date();
    const duration = lockDurationMs(row.attempts);
    row.lockedUntil = duration > 0 ? new Date(Date.now() + duration) : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (error as { code?: string } | null)?.code === '23505';
  }

  async clearFailures(
    identifier: string,
    ipAddress?: string | null,
  ): Promise<void> {
    void ipAddress; // The address no longer takes part in the key.
    await this.repository.delete(this.getKey(identifier));
  }
}
