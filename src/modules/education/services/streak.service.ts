import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserStreak } from '../entities';

export interface RecordStreakActivityOptions {
  /**
   * XP awarded for the activity. `0` keeps the activity streak-only
   * (flashcard reviews award XP through the review session instead).
   */
  xp?: number;
  /**
   * Track `totalDays` alongside the streak counters. Lesson flows do,
   * flashcard reviews only move current/longest streak.
   */
  trackTotalDays?: boolean;
  /**
   * Join an already-open transaction instead of opening a new one, so the
   * streak update commits (or rolls back) together with the caller's writes.
   */
  runner?: EntityManager;
}

@Injectable()
export class StreakService {
  constructor(
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
  ) {}

  async getUserStreak(userId: string): Promise<UserStreak> {
    let streak = await this.userStreakRepository.findOne({ where: { userId } });

    if (!streak) {
      // Two concurrent first activities both attempt the insert; the
      // (user_id) unique constraint absorbs the loser instead of throwing 23505.
      await this.userStreakRepository
        .createQueryBuilder()
        .insert()
        .into(UserStreak)
        .values({ userId })
        .orIgnore()
        .execute();
      streak = await this.userStreakRepository.findOneOrFail({
        where: { userId },
      });
    }

    return streak;
  }

  async updateStreak(
    userId: string,
    runner?: EntityManager,
  ): Promise<UserStreak> {
    return this.recordActivity(userId, {
      xp: 10,
      trackTotalDays: true,
      runner,
    });
  }

  /**
   * Record one learning activity under a pessimistic write lock so
   * concurrent activities (lesson completion, flashcard review) serialize
   * instead of racing a read-modify-write on the streak counters.
   */
  async recordActivity(
    userId: string,
    options: RecordStreakActivityOptions = {},
  ): Promise<UserStreak> {
    const { xp = 0, trackTotalDays = false, runner } = options;

    // Joining a caller-owned transaction keeps the streak update atomic with
    // the rest of the flow; otherwise open a dedicated one.
    if (runner) {
      return this.applyActivity(runner, userId, xp, trackTotalDays);
    }

    return this.userStreakRepository.manager.transaction((manager) =>
      this.applyActivity(manager, userId, xp, trackTotalDays),
    );
  }

  private async applyActivity(
    manager: EntityManager,
    userId: string,
    xp: number,
    trackTotalDays: boolean,
  ): Promise<UserStreak> {
    const repo = manager.getRepository(UserStreak);

    // Make sure the row exists before taking the lock.
    await repo
      .createQueryBuilder()
      .insert()
      .into(UserStreak)
      .values({ userId })
      .orIgnore()
      .execute();

    const streak = await repo.findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!streak) {
      throw new Error(`Streak row missing for user ${userId}`);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActivity = streak.lastActivityDate
      ? new Date(streak.lastActivityDate)
      : null;
    lastActivity?.setHours(0, 0, 0, 0);

    let changed = false;

    if (!lastActivity) {
      // First activity
      streak.currentStreak = 1;
      streak.longestStreak = 1;
      if (trackTotalDays) {
        streak.totalDays = 1;
      }
      streak.lastActivityDate = today;
      changed = true;
    } else {
      const daysDiff = Math.floor(
        (today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysDiff !== 0) {
        if (daysDiff === 1) {
          // Consecutive day
          streak.currentStreak += 1;
          if (trackTotalDays) {
            streak.totalDays += 1;
          }
        } else {
          // Streak broken
          streak.currentStreak = 1;
          if (trackTotalDays) {
            streak.totalDays += 1;
          }
        }
        if (streak.currentStreak > streak.longestStreak) {
          streak.longestStreak = streak.currentStreak;
        }
        streak.lastActivityDate = today;
        changed = true;
      }
    }

    if (xp !== 0) {
      streak.totalXp += xp;
      // Level up every 100 XP
      streak.level = Math.floor(streak.totalXp / 100) + 1;
      changed = true;
    }

    if (!changed) {
      // Same-day repeat with no XP: nothing to persist.
      return streak;
    }

    return repo.save(streak);
  }
}
