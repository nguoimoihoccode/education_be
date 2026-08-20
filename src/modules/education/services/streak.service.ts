import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStreak } from '../entities';

@Injectable()
export class StreakService {
  constructor(
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
  ) {}

  async getUserStreak(userId: string): Promise<UserStreak> {
    let streak = await this.userStreakRepository.findOne({ where: { userId } });

    if (!streak) {
      streak = this.userStreakRepository.create({ userId });
      streak = await this.userStreakRepository.save(streak);
    }

    return streak;
  }

  async updateStreak(userId: string): Promise<UserStreak> {
    const streak = await this.getUserStreak(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActivity = streak.lastActivityDate
      ? new Date(streak.lastActivityDate)
      : null;
    lastActivity?.setHours(0, 0, 0, 0);

    if (!lastActivity) {
      // First activity
      streak.currentStreak = 1;
      streak.longestStreak = 1;
      streak.totalDays = 1;
    } else {
      const daysDiff = Math.floor(
        (today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysDiff === 0) {
        // Same day - no change
      } else if (daysDiff === 1) {
        // Consecutive day
        streak.currentStreak += 1;
        streak.totalDays += 1;
        if (streak.currentStreak > streak.longestStreak) {
          streak.longestStreak = streak.currentStreak;
        }
      } else {
        // Streak broken
        streak.currentStreak = 1;
        streak.totalDays += 1;
      }
    }

    streak.lastActivityDate = today;
    streak.totalXp += 10; // Base XP for activity

    // Level up every 100 XP
    streak.level = Math.floor(streak.totalXp / 100) + 1;

    return this.userStreakRepository.save(streak);
  }
}
