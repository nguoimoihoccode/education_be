import {
  FlashcardService,
  buildDeckStatsResult,
  buildFlashcardStatsResult,
} from './flashcard.service';

const createRepository = (overrides: Record<string, unknown> = {}) => ({
  count: jest.fn(),
  create: jest.fn((value) => value),
  createQueryBuilder: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  increment: jest.fn(),
  remove: jest.fn(),
  save: jest.fn((value) => Promise.resolve(value)),
  update: jest.fn(),
  ...overrides,
});

const createService = (repositories: Record<string, any> = {}) => {
  const flashcardDeckRepository =
    repositories.flashcardDeckRepository ?? createRepository();
  const flashcardRepository =
    repositories.flashcardRepository ?? createRepository();
  const userFlashcardRepository =
    repositories.userFlashcardRepository ?? createRepository();
  const reviewSessionRepository =
    repositories.reviewSessionRepository ?? createRepository();
  const vocabularyRepository =
    repositories.vocabularyRepository ?? createRepository();
  const lessonRepository = repositories.lessonRepository ?? createRepository();
  const userStreakRepository =
    repositories.userStreakRepository ?? createRepository();

  const service = new FlashcardService(
    flashcardDeckRepository as any,
    flashcardRepository as any,
    userFlashcardRepository as any,
    reviewSessionRepository as any,
    vocabularyRepository as any,
    lessonRepository as any,
    userStreakRepository as any,
  );

  return {
    service,
    flashcardDeckRepository,
    flashcardRepository,
    userFlashcardRepository,
    reviewSessionRepository,
    vocabularyRepository,
    lessonRepository,
    userStreakRepository,
  };
};

describe('buildFlashcardStatsResult', () => {
  it('adds streak and xp values to the existing stats payload', () => {
    expect(
      buildFlashcardStatsResult({
        totalFlashcards: 10,
        statusStats: { NEW: 3, LEARNING: 4, MASTERED: 3 },
        dueCount: 2,
        totalReviews: 15,
        correctRate: 0.8,
        currentStreak: 5,
        longestStreak: 9,
        totalXp: 120,
      }),
    ).toEqual({
      totalFlashcards: 10,
      statusStats: { NEW: 3, LEARNING: 4, MASTERED: 3 },
      dueCount: 2,
      totalReviews: 15,
      correctRate: 0.8,
      currentStreak: 5,
      longestStreak: 9,
      totalXp: 120,
    });
  });

  it('defaults streak and xp to zero when sources are missing', () => {
    expect(
      buildFlashcardStatsResult({
        totalFlashcards: 0,
        statusStats: {},
        dueCount: 0,
        totalReviews: 0,
        correctRate: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalXp: 0,
      }),
    ).toEqual({
      totalFlashcards: 0,
      statusStats: {},
      dueCount: 0,
      totalReviews: 0,
      correctRate: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalXp: 0,
    });
  });

  it('keeps totalXp from the provided aggregate source of truth', () => {
    expect(
      buildFlashcardStatsResult({
        totalFlashcards: 3,
        statusStats: { MASTERED: 3 },
        dueCount: 0,
        totalReviews: 9,
        correctRate: 1,
        currentStreak: 4,
        longestStreak: 7,
        totalXp: 230,
      }).totalXp,
    ).toBe(230);
  });

  it('builds deck stats with real review aggregates', () => {
    expect(
      buildDeckStatsResult({
        deck: { id: 'deck-1', name: 'HSK1' },
        totalFlashcards: 12,
        statusStats: { NEW: 2, LEARNING: 4, MASTERED: 6 },
        dueCount: 3,
        totalReviews: 25,
        correctRate: 0.84,
        lastReviewed: new Date('2026-05-01T00:00:00.000Z'),
      }),
    ).toEqual({
      deck: { id: 'deck-1', name: 'HSK1' },
      totalFlashcards: 12,
      statusStats: { NEW: 2, LEARNING: 4, MASTERED: 6 },
      dueCount: 3,
      totalReviews: 25,
      correctRate: 0.84,
      lastReviewed: new Date('2026-05-01T00:00:00.000Z'),
    });
  });
});

describe('FlashcardService review behavior', () => {
  it('uses case-insensitive substring matching for flashcard search', async () => {
    const flashcardRepository = createRepository({
      findAndCount: jest.fn().mockResolvedValue([[{ id: 'card-1' }], 1]),
    });
    const { service } = createService({ flashcardRepository });

    await service.searchFlashcards(1, 'hello', 1, 10);

    expect(flashcardRepository.findAndCount).toHaveBeenCalledWith({
      where: [
        { userId: 1, front: expect.any(Object) },
        { userId: 1, back: expect.any(Object) },
      ],
      skip: 0,
      take: 10,
      order: { createdAt: 'DESC' },
    });
  });

  it('includes new flashcards without user review rows in due review results', async () => {
    const dueUserFlashcards = [{ flashcardId: 'reviewed-card' }];
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(dueUserFlashcards),
      innerJoin: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    };
    const flashcardRepository = createRepository({
      find: jest.fn((options) => {
        if (options.where.status === 'NEW') {
          return Promise.resolve([{ id: 'new-card' }]);
        }

        return Promise.resolve([{ id: 'reviewed-card' }]);
      }),
    });
    const { service } = createService({
      flashcardRepository,
      userFlashcardRepository: createRepository({
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      }),
    });

    const result = await service.getFlashcardsToReview(1, undefined, 20);

    expect(flashcardRepository.find).toHaveBeenNthCalledWith(1, {
      where: { id: expect.any(Object) },
    });
    expect(flashcardRepository.find).toHaveBeenNthCalledWith(2, {
      where: { userId: 1, status: 'NEW' },
      take: 19,
      order: { createdAt: 'ASC' },
    });
    expect(result).toEqual([{ id: 'reviewed-card' }, { id: 'new-card' }]);
  });

  it('returns the updated next review date after the first flashcard review', async () => {
    const savedUserFlashcards: any[] = [];
    const userFlashcardRepository = createRepository({
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (value) => {
        savedUserFlashcards.push({ ...value });
        return value;
      }),
    });
    const { service } = createService({
      flashcardRepository: createRepository({
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'card-1', deckId: 'deck-1' }),
        update: jest.fn(),
      }),
      userFlashcardRepository,
      userStreakRepository: createRepository({
        create: jest.fn((value) => value),
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      }),
    });

    const result = await service.reviewFlashcard(1, {
      flashcardId: 'card-1',
      quality: 5,
    });

    expect(result.success).toBe(true);
    expect(result.nextReview).toBeDefined();
    expect(savedUserFlashcards.at(-1).nextReview).toBe(result.nextReview);
  });

  it('persists review session result counts when completing a session', async () => {
    const session = { id: 'session-1', userId: 1, results: [] };
    const reviewSessionRepository = createRepository({
      findOne: jest.fn().mockResolvedValue(session),
      save: jest.fn((value) => Promise.resolve(value)),
    });
    const { service } = createService({ reviewSessionRepository });

    const result = await service.completeReviewSession(1, {
      sessionId: 'session-1',
      results: [
        { flashcardId: 'card-1', quality: 5, isCorrect: true, timeSpent: 4 },
        { flashcardId: 'card-2', quality: 1, isCorrect: false, timeSpent: 6 },
      ],
      skippedCards: 1,
    });

    expect(result).toMatchObject({
      completed: true,
      correctCards: 1,
      wrongCards: 1,
      skippedCards: 1,
      timeSpent: 10,
      totalCards: 3,
      xpEarned: 10,
    });
  });
});
