import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthLoginAttempt } from './entities/auth-login-attempt.entity';

const FIFTEEN_MINUTES_MS = 15 * 60_000;
const ONE_HOUR_MS = 3_600_000;
const TWELVE_HOURS_MS = 12 * ONE_HOUR_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export const LOCK_THRESHOLD = 5;

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

  private getKey(identifier: string, ipAddress?: string | null) {
    return {
      identifier: normalizeIdentifier(identifier),
      ipAddress: ipAddress || 'unknown',
    };
  }

  async getLockRemainingMs(
    identifier: string,
    ipAddress?: string | null,
  ): Promise<number> {
    const row = await this.repository.findOne({
      where: this.getKey(identifier, ipAddress),
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
    const key = this.getKey(identifier, ipAddress);
    let row = await this.repository.findOne({ where: key });
    if (!row) {
      row = this.repository.create({
        ...key,
        attempts: 0,
        lastAttemptAt: new Date(),
        lockedUntil: null,
      });
    }
    row.attempts += 1;
    row.lastAttemptAt = new Date();
    const duration = lockDurationMs(row.attempts);
    row.lockedUntil = duration > 0 ? new Date(Date.now() + duration) : null;
    await this.repository.save(row);
  }

  async clearFailures(
    identifier: string,
    ipAddress?: string | null,
  ): Promise<void> {
    await this.repository.delete(this.getKey(identifier, ipAddress));
  }
}
