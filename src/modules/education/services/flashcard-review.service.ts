import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual } from 'typeorm';
import {
  Flashcard,
  UserFlashcard,
  ReviewSession,
  UserStreak,
} from '../entities';
import {
  ReviewFlashcardDto,
  StartReviewSessionDto,
  CompleteReviewSessionDto,
} from '../dto';
import { calculateSrsReview, nextReviewDate } from '../domain/srs.policy';

@Injectable()
export class FlashcardReviewService {
  constructor(
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(UserFlashcard)
    private readonly userFlashcardRepository: Repository<UserFlashcard>,
    @InjectRepository(ReviewSession)
    private readonly reviewSessionRepository: Repository<ReviewSession>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
  ) {}

  // ==================== Review System ====================

  async startReviewSession(userId: number, dto: StartReviewSessionDto) {
    const flashcards = await this.getFlashcardsToReview(
      userId,
      dto.deckId,
      dto.limit,
    );

    const session = this.reviewSessionRepository.create({
      type: dto.type || 'DAILY',
      totalCards: flashcards.length,
      deckId: dto.deckId,
      userId,
      results: [],
    });

    return this.reviewSessionRepository.save(session);
  }

  async reviewFlashcard(userId: number, dto: ReviewFlashcardDto) {
    const userFlashcard = await this.userFlashcardRepository.findOne({
      where: { userId, flashcardId: dto.flashcardId },
    });

    let reviewedFlashcard = userFlashcard;

    if (!reviewedFlashcard) {
      // First time reviewing this card
      const flashcard = await this.flashcardRepository.findOne({
        where: { id: dto.flashcardId },
      });

      if (!flashcard) {
        throw new NotFoundException('Flashcard not found');
      }

      const newUserFlashcard = this.userFlashcardRepository.create({
        userId,
        flashcardId: dto.flashcardId,
        deckId: flashcard.deckId,
        firstReviewed: new Date(),
      });

      await this.userFlashcardRepository.save(newUserFlashcard);

      // Update SRS
      this.calculateSRS(newUserFlashcard, dto.quality);

      // Update counts
      if (dto.quality >= 3) {
        newUserFlashcard.correctCount++;
        newUserFlashcard.streak++;
      } else {
        newUserFlashcard.wrongCount++;
        newUserFlashcard.streak = 0;
      }
      newUserFlashcard.totalReviews++;
      newUserFlashcard.lastReviewed = new Date();

      reviewedFlashcard =
        await this.userFlashcardRepository.save(newUserFlashcard);
    } else {
      // Update SRS
      this.calculateSRS(reviewedFlashcard, dto.quality);

      // Update counts
      if (dto.quality >= 3) {
        reviewedFlashcard.correctCount++;
        reviewedFlashcard.streak++;
      } else {
        reviewedFlashcard.wrongCount++;
        reviewedFlashcard.streak = 0;
      }
      reviewedFlashcard.totalReviews++;
      reviewedFlashcard.lastReviewed = new Date();

      reviewedFlashcard =
        await this.userFlashcardRepository.save(reviewedFlashcard);
    }

    // Update flashcard status
    await this.updateFlashcardStatus(dto.flashcardId);

    // Update streak and XP
    await this.updateStreak(userId);

    return { success: true, nextReview: reviewedFlashcard.nextReview };
  }

  async completeReviewSession(userId: number, dto: CompleteReviewSessionDto) {
    const session = await this.reviewSessionRepository.findOne({
      where: { id: dto.sessionId, userId },
    });

    if (!session) {
      throw new NotFoundException('Review session not found');
    }

    session.completed = true;
    session.completedAt = new Date();

    if (dto.results) {
      session.results = dto.results.map((result) => ({
        flashcardId: result.flashcardId,
        quality: result.quality,
        isCorrect: result.isCorrect ?? result.quality >= 3,
        timeSpent: result.timeSpent ?? 0,
      }));
      session.correctCards = session.results.filter(
        (result) => result.isCorrect,
      ).length;
      session.wrongCards = session.results.filter(
        (result) => !result.isCorrect,
      ).length;
      session.timeSpent = session.results.reduce(
        (total, result) => total + (result.timeSpent || 0),
        0,
      );
    }

    if (dto.skippedCards !== undefined) {
      session.skippedCards = dto.skippedCards;
    }

    session.totalCards =
      session.correctCards + session.wrongCards + session.skippedCards;

    // Calculate XP
    session.xpEarned = session.correctCards * 10;

    await this.reviewSessionRepository.save(session);

    return session;
  }

  async getFlashcardsToReview(userId: number, deckId?: string, limit?: number) {
    const now = new Date();
    const take = limit ?? 20;

    const query = this.userFlashcardRepository
      .createQueryBuilder('uf')
      .innerJoin('uf.flashcard', 'f')
      .where('uf.userId = :userId', { userId })
      .andWhere('uf.nextReview <= :now', { now });

    if (deckId) {
      query.andWhere('uf.deckId = :deckId', { deckId });
    }

    query.limit(take);

    const userFlashcards = await query.getMany();

    // Get actual flashcard data
    const flashcardIds = userFlashcards.map((uf) => uf.flashcardId);
    const reviewedFlashcards = flashcardIds.length
      ? await this.flashcardRepository.find({
          where: { id: In(flashcardIds) },
        })
      : [];

    const remaining = Math.max(take - reviewedFlashcards.length, 0);
    const newWhere: any = { userId, status: 'NEW' };

    if (deckId) {
      newWhere.deckId = deckId;
    }

    const newFlashcards = remaining
      ? await this.flashcardRepository.find({
          where: newWhere,
          take: remaining,
          order: { createdAt: 'ASC' },
        })
      : [];

    return [...reviewedFlashcards, ...newFlashcards];
  }

  private calculateSRS(userFlashcard: UserFlashcard, quality: number): void {
    const result = calculateSrsReview({
      quality,
      easeFactor: Number(userFlashcard.easeFactor),
      interval: userFlashcard.interval,
      repetitions: userFlashcard.repetitions,
    });

    userFlashcard.easeFactor = result.easeFactor;
    userFlashcard.interval = result.interval;
    userFlashcard.repetitions = result.repetitions;
    userFlashcard.nextReview = nextReviewDate(new Date(), result.interval);
  }

  private async updateFlashcardStatus(flashcardId: string) {
    const userFlashcard = await this.userFlashcardRepository.findOne({
      where: { flashcardId },
    });

    if (!userFlashcard) {
      return;
    }

    let status: 'NEW' | 'LEARNING' | 'REVIEWING' | 'MASTERED' = 'NEW';

    if (userFlashcard.totalReviews === 0) {
      status = 'NEW';
    } else if (userFlashcard.totalReviews < 5) {
      status = 'LEARNING';
    } else if (userFlashcard.totalReviews < 20) {
      status = 'REVIEWING';
    } else {
      status = 'MASTERED';
    }

    await this.flashcardRepository.update({ id: flashcardId }, { status });
  }

  private async updateStreak(userId: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let streak = await this.userStreakRepository.findOne({
      where: { userId: String(userId) },
    });

    if (!streak) {
      streak = this.userStreakRepository.create({
        userId: String(userId),
        currentStreak: 1,
        longestStreak: 1,
        lastActivityDate: today,
      });
    } else {
      const lastStudy = new Date(streak.lastActivityDate);
      lastStudy.setHours(0, 0, 0, 0);

      const diffDays = Math.floor(
        (today.getTime() - lastStudy.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 0) {
        // Same day, no change
        return;
      } else if (diffDays === 1) {
        // Consecutive day
        streak.currentStreak++;
        streak.longestStreak = Math.max(
          streak.longestStreak,
          streak.currentStreak,
        );
      } else {
        // Streak broken
        streak.currentStreak = 1;
      }

      streak.lastActivityDate = today;
    }

    await this.userStreakRepository.save(streak);
  }

  async getDueFlashcardsCount(userId: number, deckId?: string) {
    const now = new Date();

    const where: any = {
      userId,
      nextReview: LessThanOrEqual(now),
    };

    if (deckId) {
      where.deckId = deckId;
    }

    return this.userFlashcardRepository.count({ where });
  }
}
