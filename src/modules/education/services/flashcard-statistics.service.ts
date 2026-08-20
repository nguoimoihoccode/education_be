import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
  FlashcardDeck,
  Flashcard,
  UserFlashcard,
  ReviewSession,
  UserStreak,
} from '../entities';

interface StatusCountRow {
  status: string;
  count: string;
}

interface TotalRow {
  total: string | null;
}

interface RateRow {
  rate: string | null;
}

export interface FlashcardStatsResultInput {
  totalFlashcards: number;
  statusStats: Record<string, number>;
  dueCount: number;
  totalReviews: number;
  correctRate: number;
  currentStreak: number;
  longestStreak: number;
  totalXp: number;
}

export function buildFlashcardStatsResult(input: FlashcardStatsResultInput) {
  return {
    totalFlashcards: input.totalFlashcards,
    statusStats: input.statusStats,
    dueCount: input.dueCount,
    totalReviews: input.totalReviews,
    correctRate: input.correctRate,
    currentStreak: input.currentStreak,
    longestStreak: input.longestStreak,
    totalXp: input.totalXp,
  };
}

export interface DeckStatsResultInput {
  deck: unknown;
  totalFlashcards: number;
  statusStats: Record<string, number>;
  dueCount: number;
  totalReviews: number;
  correctRate: number;
  lastReviewed: Date | string | null;
}

export function buildDeckStatsResult(input: DeckStatsResultInput) {
  return {
    deck: input.deck,
    totalFlashcards: input.totalFlashcards,
    statusStats: input.statusStats,
    dueCount: input.dueCount,
    totalReviews: input.totalReviews,
    correctRate: input.correctRate,
    lastReviewed: input.lastReviewed,
  };
}

@Injectable()
export class FlashcardStatisticsService {
  constructor(
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(FlashcardDeck)
    private readonly flashcardDeckRepository: Repository<FlashcardDeck>,
    @InjectRepository(UserFlashcard)
    private readonly userFlashcardRepository: Repository<UserFlashcard>,
    @InjectRepository(ReviewSession)
    private readonly reviewSessionRepository: Repository<ReviewSession>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
  ) {}

  private async getOwnedDeckById(deckId: string, userId: number) {
    const deck = await this.flashcardDeckRepository.findOne({
      where: { id: deckId, userId },
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    return deck;
  }

  private async getUserFlashcardStreakStats(userId: number) {
    const streak = await this.userStreakRepository.findOne({
      where: { userId: String(userId) },
    });

    return {
      currentStreak: streak?.currentStreak ?? 0,
      longestStreak: streak?.longestStreak ?? 0,
    };
  }

  private async getUserFlashcardXpTotal(userId: number) {
    const streak = await this.userStreakRepository.findOne({
      where: { userId: String(userId) },
    });

    return streak?.totalXp ?? 0;
  }

  // ==================== Statistics & Progress ====================

  async getFlashcardStats(userId: number) {
    const totalFlashcards = await this.flashcardRepository.count({
      where: { userId },
    });

    const statusStats = await this.flashcardRepository
      .createQueryBuilder('f')
      .select('f.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('f.userId = :userId', { userId })
      .groupBy('f.status')
      .getRawMany<StatusCountRow>();

    const dueCount = await this.userFlashcardRepository.count({
      where: {
        userId,
        nextReview: LessThanOrEqual(new Date()),
      },
    });

    const totalReviews = await this.userFlashcardRepository
      .createQueryBuilder('uf')
      .select('SUM(uf.totalReviews)', 'total')
      .where('uf.userId = :userId', { userId })
      .getRawOne<TotalRow>();

    const correctRate = await this.userFlashcardRepository
      .createQueryBuilder('uf')
      .select(
        'SUM(uf.correctCount)::float / NULLIF(SUM(uf.totalReviews), 0)',
        'rate',
      )
      .where('uf.userId = :userId', { userId })
      .getRawOne<RateRow>();

    const [{ currentStreak, longestStreak }, totalXp] = await Promise.all([
      this.getUserFlashcardStreakStats(userId),
      this.getUserFlashcardXpTotal(userId),
    ]);

    return buildFlashcardStatsResult({
      totalFlashcards,
      statusStats: statusStats.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = parseInt(item.count, 10);
        return acc;
      }, {}),
      dueCount,
      totalReviews: parseInt(totalReviews?.total || '0'),
      correctRate: parseFloat(correctRate?.rate || '0'),
      currentStreak,
      longestStreak,
      totalXp,
    });
  }

  async getDeckStats(userId: number, deckId: string) {
    const deck = await this.getOwnedDeckById(deckId, userId);

    const totalFlashcards = await this.flashcardRepository.count({
      where: { userId, deckId },
    });

    const statusStats = await this.flashcardRepository
      .createQueryBuilder('f')
      .select('f.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('f.userId = :userId', { userId })
      .andWhere('f.deckId = :deckId', { deckId })
      .groupBy('f.status')
      .getRawMany<StatusCountRow>();

    const dueCount = await this.userFlashcardRepository.count({
      where: {
        userId,
        deckId,
        nextReview: LessThanOrEqual(new Date()),
      },
    });

    const totalReviews = await this.userFlashcardRepository
      .createQueryBuilder('uf')
      .select('SUM(uf.totalReviews)', 'total')
      .where('uf.userId = :userId', { userId })
      .andWhere('uf.deckId = :deckId', { deckId })
      .getRawOne<TotalRow>();

    const correctRate = await this.userFlashcardRepository
      .createQueryBuilder('uf')
      .select(
        'SUM(uf.correctCount)::float / NULLIF(SUM(uf.totalReviews), 0)',
        'rate',
      )
      .where('uf.userId = :userId', { userId })
      .andWhere('uf.deckId = :deckId', { deckId })
      .getRawOne<RateRow>();

    const lastReviewed = await this.userFlashcardRepository
      .createQueryBuilder('uf')
      .select('MAX(uf.lastReviewed)', 'lastReviewed')
      .where('uf.userId = :userId', { userId })
      .andWhere('uf.deckId = :deckId', { deckId })
      .getRawOne<{ lastReviewed?: Date | string | null }>();

    return buildDeckStatsResult({
      deck,
      totalFlashcards,
      statusStats: statusStats.reduce<Record<string, number>>((acc, item) => {
        acc[item.status] = parseInt(item.count, 10);
        return acc;
      }, {}),
      dueCount,
      totalReviews: parseInt(totalReviews?.total || '0', 10),
      correctRate: parseFloat(correctRate?.rate || '0'),
      lastReviewed: lastReviewed?.lastReviewed ?? null,
    });
  }

  async getReviewHistory(userId: number, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await this.reviewSessionRepository.findAndCount({
      where: { userId },
      skip,
      take: limit,
      order: { startedAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      sessions,
      total,
      page,
      limit,
      totalPages,
    };
  }
}
