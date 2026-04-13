import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, In } from 'typeorm';
import {
  FlashcardDeck,
  Flashcard,
  UserFlashcard,
  ReviewSession,
  ReviewResult,
} from './entities';
import {
  CreateFlashcardDeckDto,
  UpdateFlashcardDeckDto,
  CreateFlashcardDto,
  BulkCreateFlashcardDto,
  UpdateFlashcardDto,
  ReviewFlashcardDto,
  StartReviewSessionDto,
  CompleteReviewSessionDto,
  ImportFromVocabularyDto,
  ImportFromVocabularyBulkDto,
} from './dto';
import { Vocabulary } from './entities/vocabulary.entity';
import { Lesson } from './entities/lesson.entity';
import { UserStreak } from './entities/user-streak.entity';

@Injectable()
export class FlashcardService {
  constructor(
    @InjectRepository(FlashcardDeck)
    private readonly flashcardDeckRepository: Repository<FlashcardDeck>,
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(UserFlashcard)
    private readonly userFlashcardRepository: Repository<UserFlashcard>,
    @InjectRepository(ReviewSession)
    private readonly reviewSessionRepository: Repository<ReviewSession>,
    @InjectRepository(Vocabulary)
    private readonly vocabularyRepository: Repository<Vocabulary>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
  ) {}

  // ==================== Deck Management ====================

  async createDeck(userId: number, dto: CreateFlashcardDeckDto) {
    const deck = this.flashcardDeckRepository.create({
      ...dto,
      userId,
      cardCount: 0,
    });
    return this.flashcardDeckRepository.save(deck);
  }

  async getDecks(
    userId: number,
    page: number = 1,
    limit: number = 10,
    topic?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (topic) {
      where.topic = topic;
    }

    const [decks, total] = await this.flashcardDeckRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      decks,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getDeckById(deckId: string, userId: number) {
    const deck = await this.flashcardDeckRepository.findOne({
      where: { id: deckId, userId },
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    return deck;
  }

  async updateDeck(
    deckId: string,
    userId: number,
    dto: UpdateFlashcardDeckDto,
  ) {
    const deck = await this.getDeckById(deckId, userId);
    Object.assign(deck, dto);
    return this.flashcardDeckRepository.save(deck);
  }

  async deleteDeck(deckId: string, userId: number) {
    const deck = await this.getDeckById(deckId, userId);
    await this.flashcardDeckRepository.remove(deck);
    return { message: 'Deck deleted successfully' };
  }

  async getPublicDecks(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [decks, total] = await this.flashcardDeckRepository.findAndCount({
      where: { isPublic: true },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      decks,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getDecksByTopic(
    userId: number,
    topic: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [decks, total] = await this.flashcardDeckRepository.findAndCount({
      where: { userId, topic },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      decks,
      total,
      page,
      limit,
      totalPages,
      topic,
    };
  }

  async getAvailableTopics(userId: number) {
    const topics = await this.flashcardDeckRepository
      .createQueryBuilder('deck')
      .select('deck.topic', 'topic')
      .addSelect('COUNT(*)', 'count')
      .where('deck.userId = :userId', { userId })
      .andWhere('deck.topic IS NOT NULL')
      .groupBy('deck.topic')
      .orderBy('deck.topic', 'ASC')
      .getRawMany();

    return topics.map((item) => ({
      topic: item.topic,
      count: parseInt(item.count),
    }));
  }

  // ==================== Flashcard CRUD ====================

  async createFlashcard(userId: number, dto: CreateFlashcardDto) {
    // Check for duplicate
    const duplicate = await this.checkDuplicateFlashcard(dto.front, userId);
    if (duplicate) {
      throw new ConflictException('Flashcard with this front already exists');
    }

    const flashcard = this.flashcardRepository.create({
      ...dto,
      userId,
      deckId: dto.deckId,
    });

    const savedFlashcard = await this.flashcardRepository.save(flashcard);

    // Update deck card count
    if (dto.deckId) {
      await this.flashcardDeckRepository.increment(
        { id: dto.deckId },
        'cardCount',
        1,
      );
    }

    return savedFlashcard;
  }

  async bulkCreateFlashcards(userId: number, dto: BulkCreateFlashcardDto) {
    const created = [];
    const skipped = [];

    for (const cardDto of dto.flashcards) {
      const duplicate = await this.checkDuplicateFlashcard(
        cardDto.front,
        userId,
      );
      if (duplicate) {
        skipped.push(cardDto.front);
        continue;
      }

      const flashcard = this.flashcardRepository.create({
        ...cardDto,
        userId,
        deckId: dto.deckId || cardDto.deckId,
      });

      const saved = await this.flashcardRepository.save(flashcard);
      created.push(saved);
    }

    // Update deck card count
    if (dto.deckId) {
      await this.flashcardDeckRepository.increment(
        { id: dto.deckId },
        'cardCount',
        created.length,
      );
    }

    return {
      created,
      skipped,
      total: created.length,
    };
  }

  async getFlashcards(
    userId: number,
    deckId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (deckId) {
      where.deckId = deckId;
    }

    const [flashcards, total] = await this.flashcardRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      flashcards,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getFlashcardById(flashcardId: string, userId: number) {
    const flashcard = await this.flashcardRepository.findOne({
      where: { id: flashcardId, userId },
    });

    if (!flashcard) {
      throw new NotFoundException('Flashcard not found');
    }

    // Increment view count
    await this.flashcardRepository.increment(
      { id: flashcardId },
      'viewCount',
      1,
    );

    return flashcard;
  }

  async updateFlashcard(
    flashcardId: string,
    userId: number,
    dto: UpdateFlashcardDto,
  ) {
    const flashcard = await this.getFlashcardById(flashcardId, userId);

    // Check for duplicate if front is being updated
    if (dto.front && dto.front !== flashcard.front) {
      const duplicate = await this.checkDuplicateFlashcard(dto.front, userId);
      if (duplicate) {
        throw new ConflictException('Flashcard with this front already exists');
      }
    }

    Object.assign(flashcard, dto);
    return this.flashcardRepository.save(flashcard);
  }

  async deleteFlashcard(flashcardId: string, userId: number) {
    const flashcard = await this.getFlashcardById(flashcardId, userId);
    const deckId = flashcard.deckId;

    await this.flashcardRepository.remove(flashcard);

    // Update deck card count
    if (deckId) {
      await this.flashcardDeckRepository.decrement(
        { id: deckId },
        'cardCount',
        1,
      );
    }

    return { message: 'Flashcard deleted successfully' };
  }

  async searchFlashcards(
    userId: number,
    query: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [flashcards, total] = await this.flashcardRepository.findAndCount({
      where: [
        { userId, front: `%${query}%` },
        { userId, back: `%${query}%` },
      ],
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      flashcards,
      total,
      page,
      limit,
      totalPages,
    };
  }

  // ==================== Import from Vocabulary ====================

  async importFromVocabulary(userId: number, dto: ImportFromVocabularyDto) {
    const lesson = await this.lessonRepository.findOne({
      where: { id: dto.lessonId },
      relations: ['course'],
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const vocabularies = await this.vocabularyRepository.find({
      where: { lessonId: dto.lessonId },
    });

    let deckId = dto.deckId;

    // Create new deck if not provided
    if (!deckId || dto.createDeck) {
      // Auto-assign topic based on course level
      const topic = this.mapCourseLevelToTopic(lesson.course?.level);

      const deck = this.flashcardDeckRepository.create({
        name: `${lesson.title} - Flashcards`,
        description: `Auto-generated from lesson: ${lesson.title}`,
        type: 'SYSTEM',
        userId,
        isPublic: false,
        topic,
      });
      const savedDeck = await this.flashcardDeckRepository.save(deck);
      deckId = savedDeck.id;
    }

    let imported = 0;
    let skipped = 0;

    for (const vocab of vocabularies) {
      // Check for duplicates
      const duplicate = await this.checkDuplicateFlashcard(vocab.word, userId);
      if (duplicate) {
        skipped++;
        continue;
      }

      await this.createFlashcardFromVocabulary(vocab, deckId, userId);
      imported++;
    }

    // Update deck card count
    await this.flashcardDeckRepository.increment(
      { id: deckId },
      'cardCount',
      imported,
    );

    return { imported, skipped, deckId };
  }

  async importFromVocabularyBulk(
    userId: number,
    dto: ImportFromVocabularyBulkDto,
  ) {
    let totalImported = 0;
    let totalSkipped = 0;
    const results = [];

    for (const lessonId of dto.lessonIds) {
      try {
        const result = await this.importFromVocabulary(userId, {
          lessonId,
          deckId: dto.deckId,
          createDeck: false,
        });
        totalImported += result.imported;
        totalSkipped += result.skipped;
        results.push({
          lessonId,
          ...result,
        });
      } catch (error) {
        results.push({
          lessonId,
          error: error.message,
        });
      }
    }

    return {
      totalImported,
      totalSkipped,
      results,
    };
  }

  private async createFlashcardFromVocabulary(
    vocab: Vocabulary,
    deckId: string,
    userId: number,
  ) {
    const flashcard = this.flashcardRepository.create({
      front: vocab.word,
      back: vocab.meaning,
      pronunciation: vocab.pronunciation,
      example: vocab.example,
      exampleTranslation: vocab.exampleTranslation,
      audioUrl: vocab.audioUrl,
      imageUrl: vocab.imageUrl,
      deckId,
      userId,
      sourceVocabularyId: vocab.id,
      status: 'NEW',
      difficulty: 1,
    });

    return this.flashcardRepository.save(flashcard);
  }

  private async checkDuplicateFlashcard(
    front: string,
    userId: number,
  ): Promise<boolean> {
    const existing = await this.flashcardRepository.findOne({
      where: { front, userId },
    });
    return !!existing;
  }

  private async findExistingFlashcard(
    front: string,
    userId: number,
  ): Promise<Flashcard | null> {
    return this.flashcardRepository.findOne({
      where: { front, userId },
    });
  }

  private mapCourseLevelToTopic(courseLevel?: string): string {
    // Map course levels to topic names (e.g., HSK levels for Chinese)
    const levelMap: { [key: string]: string } = {
      beginner: 'HSK1',
      elementary: 'HSK2',
      intermediate: 'HSK3',
      upper_intermediate: 'HSK4',
      advanced: 'HSK5',
    };

    return levelMap[courseLevel || ''] || 'General';
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
    const userFlashcard = await this.userFlashcardRepository.findOne({
      where: { userId, flashcardId: dto.flashcardId },
    });

    if (!userFlashcard) {
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

      await this.userFlashcardRepository.save(newUserFlashcard);
    } else {
      // Update SRS
      this.calculateSRS(userFlashcard, dto.quality);

      // Update counts
      if (dto.quality >= 3) {
        userFlashcard.correctCount++;
        userFlashcard.streak++;
      } else {
        userFlashcard.wrongCount++;
        userFlashcard.streak = 0;
      }
      userFlashcard.totalReviews++;
      userFlashcard.lastReviewed = new Date();

      await this.userFlashcardRepository.save(userFlashcard);
    }

    // Update flashcard status
    await this.updateFlashcardStatus(dto.flashcardId);

    // Update streak and XP
    await this.updateStreak(userId);

    return { success: true, nextReview: userFlashcard?.nextReview };
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

    // Calculate XP
    session.xpEarned = session.correctCards * 10;

    await this.reviewSessionRepository.save(session);

    return session;
  }

  async getFlashcardsToReview(userId: number, deckId?: string, limit?: number) {
    const now = new Date();

    const where: any = {
      userId,
      nextReview: MoreThanOrEqual(now),
    };

    if (deckId) {
      where.deckId = deckId;
    }

    const query = this.userFlashcardRepository
      .createQueryBuilder('uf')
      .innerJoin('uf.flashcard', 'f')
      .where('uf.userId = :userId', { userId })
      .andWhere('uf.nextReview <= :now', { now });

    if (deckId) {
      query.andWhere('uf.deckId = :deckId', { deckId });
    }

    if (limit) {
      query.limit(limit);
    }

    const userFlashcards = await query.getMany();

    // Get actual flashcard data
    const flashcardIds = userFlashcards.map((uf) => uf.flashcardId);
    const flashcards = await this.flashcardRepository.find({
      where: { id: In(flashcardIds) },
    });

    return flashcards;
  }

  private calculateSRS(userFlashcard: UserFlashcard, quality: number): void {
    const { easeFactor, interval, repetitions } = userFlashcard;

    if (quality >= 3) {
      // Correct answer
      if (repetitions === 0) {
        userFlashcard.interval = 1;
      } else if (repetitions === 1) {
        userFlashcard.interval = 6;
      } else {
        userFlashcard.interval = Math.round(interval * easeFactor);
      }
      userFlashcard.repetitions++;
    } else {
      // Wrong answer
      userFlashcard.repetitions = 0;
      userFlashcard.interval = 1;
    }

    // Update ease factor
    userFlashcard.easeFactor =
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    userFlashcard.easeFactor = Math.max(1.3, userFlashcard.easeFactor);

    // Calculate next review date
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + userFlashcard.interval);
    userFlashcard.nextReview = nextReview;
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
      .getRawMany();

    const dueCount = await this.userFlashcardRepository.count({
      where: {
        userId,
        nextReview: MoreThanOrEqual(new Date()),
      },
    });

    const totalReviews = await this.userFlashcardRepository
      .createQueryBuilder('uf')
      .select('SUM(uf.totalReviews)', 'total')
      .where('uf.userId = :userId', { userId })
      .getRawOne();

    const correctRate = await this.userFlashcardRepository
      .createQueryBuilder('uf')
      .select(
        'SUM(uf.correctCount)::float / NULLIF(SUM(uf.totalReviews), 0)',
        'rate',
      )
      .where('uf.userId = :userId', { userId })
      .getRawOne();

    return {
      totalFlashcards,
      statusStats: statusStats.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
      dueCount,
      totalReviews: parseInt(totalReviews?.total || '0'),
      correctRate: parseFloat(correctRate?.rate || '0'),
    };
  }

  async getDeckStats(userId: number, deckId: string) {
    const deck = await this.getDeckById(deckId, userId);

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
      .getRawMany();

    const dueCount = await this.userFlashcardRepository.count({
      where: {
        userId,
        deckId,
        nextReview: MoreThanOrEqual(new Date()),
      },
    });

    return {
      deck,
      totalFlashcards,
      statusStats: statusStats.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {}),
      dueCount,
    };
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

  async getDueFlashcardsCount(userId: number, deckId?: string) {
    const now = new Date();

    const where: any = {
      userId,
      nextReview: MoreThanOrEqual(now),
    };

    if (deckId) {
      where.deckId = deckId;
    }

    return this.userFlashcardRepository.count({ where });
  }
}
