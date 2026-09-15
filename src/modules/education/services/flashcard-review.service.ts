import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, In, LessThanOrEqual } from 'typeorm';
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
import { StreakService } from './streak.service';

@Injectable()
export class FlashcardReviewService {
  private readonly streakService: StreakService;

  constructor(
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(UserFlashcard)
    private readonly userFlashcardRepository: Repository<UserFlashcard>,
    @InjectRepository(ReviewSession)
    private readonly reviewSessionRepository: Repository<ReviewSession>,
    @InjectRepository(UserStreak)
    userStreakRepository: Repository<UserStreak>,
  ) {
    // Manual construction (matching this module's facade pattern) so the
    // review flow shares the concurrency-safe streak implementation.
    this.streakService = new StreakService(userStreakRepository);
  }

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
    // One transaction covers the SRS row, the card status, and the streak:
    // a failure in any step rolls the whole review back.
    const { nextReview } =
      await this.userFlashcardRepository.manager.transaction(
        async (manager) => {
          const flashcard = await manager
            .getRepository(Flashcard)
            .findOne({ where: { id: dto.flashcardId } });

          if (!flashcard) {
            throw new NotFoundException('Flashcard not found');
          }

          const userFlashcardRepository = manager.getRepository(UserFlashcard);

          // First time reviewing this card: insert-or-ignore the skeleton row
          // so two concurrent first reviews can't both "create" it and lose
          // one write (the (userId, flashcardId) unique constraint absorbs
          // the loser), then take the row lock for the SRS read-modify-write.
          await userFlashcardRepository
            .createQueryBuilder()
            .insert()
            .into(UserFlashcard)
            .values({
              userId,
              flashcardId: dto.flashcardId,
              deckId: flashcard.deckId,
              firstReviewed: new Date(),
            })
            .orIgnore()
            .execute();

          const reviewedFlashcard = await userFlashcardRepository.findOne({
            where: { userId, flashcardId: dto.flashcardId },
            lock: { mode: 'pessimistic_write' },
          });

          if (!reviewedFlashcard) {
            throw new Error(
              `User flashcard row missing for user ${userId} card ${dto.flashcardId}`,
            );
          }

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

          await userFlashcardRepository.save(reviewedFlashcard);

          // Update flashcard status
          await this.updateFlashcardStatus(manager, dto.flashcardId);

          // Update streak (no XP here — review sessions award it on completion)
          await this.streakService.recordActivity(String(userId), {
            trackTotalDays: false,
            runner: manager,
          });

          return { nextReview: reviewedFlashcard.nextReview };
        },
      );

    return { success: true, nextReview };
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

  private async updateFlashcardStatus(
    manager: EntityManager,
    flashcardId: string,
  ) {
    const userFlashcard = await manager
      .getRepository(UserFlashcard)
      .findOne({ where: { flashcardId } });

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

    await manager
      .getRepository(Flashcard)
      .update({ id: flashcardId }, { status });
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
