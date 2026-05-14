import {
  QuizService,
  buildQuizStatsResult,
  buildTopicQuizStatsResult,
  buildQuizSessionQuestionOrder,
  calculateQuizSessionProgress,
  hasAnsweredQuestion,
  isQuestionInSessionOrder,
} from './quiz.service';

const createRepository = (overrides: Record<string, unknown> = {}) => ({
  count: jest.fn(),
  create: jest.fn((value) => value),
  find: jest.fn(),
  findAndCount: jest.fn(),
  findOne: jest.fn(),
  increment: jest.fn(),
  save: jest.fn((value) => Promise.resolve(value)),
  ...overrides,
});

describe('quiz session helpers', () => {
  it('builds quiz stats with real score and timing aggregates', () => {
    expect(
      buildQuizStatsResult({
        totalQuizzes: 3,
        totalSessions: 4,
        averageScore: 72.5,
        highestScore: 98,
        lowestScore: 40,
        averageTimePerQuestion: 12,
        passRate: 50,
        watchedTopics: ['HSK1', 'Grammar'],
      }),
    ).toEqual({
      totalQuizzes: 3,
      totalSessions: 4,
      averageScore: 72.5,
      highestScore: 98,
      lowestScore: 40,
      averageTimePerQuestion: 12,
      passRate: 50,
      watchedTopics: ['HSK1', 'Grammar'],
      passedQuizzes: 2,
    });
  });

  it('builds topic stats with question type strengths and weaknesses', () => {
    expect(
      buildTopicQuizStatsResult({
        topic: 'HSK1',
        totalQuizzes: 2,
        totalSessions: 3,
        averageScore: 80,
        highestScore: 95,
        lowestScore: 60,
        passRate: 67,
        favoriteQuestionTypes: ['MULTIPLE_CHOICE'],
      }),
    ).toEqual({
      topic: 'HSK1',
      totalQuizzes: 2,
      totalSessions: 3,
      averageScore: 80,
      highestScore: 95,
      lowestScore: 60,
      passRate: 67,
      favoriteQuestionTypes: ['MULTIPLE_CHOICE'],
      strengths: ['MULTIPLE_CHOICE'],
      weaknesses: [],
    });
  });

  it('stores selected question ids in the order presented to the learner', () => {
    const questions = [
      { id: 'q3', points: 2 },
      { id: 'q1', points: 1 },
      { id: 'q2', points: 3 },
    ];

    expect(buildQuizSessionQuestionOrder(questions)).toEqual([
      'q3',
      'q1',
      'q2',
    ]);
  });

  it('calculates progress from stored answers and stored question order', () => {
    expect(
      calculateQuizSessionProgress({
        questionOrder: ['q3', 'q1', 'q2'],
        answers: [{ questionId: 'q3' }, { questionId: 'q1' }],
      }),
    ).toEqual({
      totalQuestions: 3,
      answeredQuestions: 2,
      currentQuestionIndex: 2,
    });
  });

  it('detects whether a question belongs to a stored session order', () => {
    expect(isQuestionInSessionOrder(['q1', 'q2'], 'q2')).toBe(true);
    expect(isQuestionInSessionOrder(['q1', 'q2'], 'q3')).toBe(false);
  });

  it('detects duplicate answers by question id', () => {
    expect(hasAnsweredQuestion([{ questionId: 'q1' }], 'q1')).toBe(true);
    expect(hasAnsweredQuestion([{ questionId: 'q1' }], 'q2')).toBe(false);
  });
});

describe('QuizService retry limits', () => {
  const createService = (
    quiz: Record<string, unknown>,
    completedAttempts: number,
  ) => {
    const quizRepository = createRepository({
      findOne: jest.fn().mockResolvedValue(quiz),
    });
    const quizSessionRepository = createRepository({
      count: jest.fn().mockResolvedValue(completedAttempts),
    });

    return new QuizService(
      quizRepository as any,
      createRepository() as any,
      quizSessionRepository as any,
      createRepository() as any,
      createRepository() as any,
    );
  };

  it('blocks quizzes that do not allow retry after one completed attempt', async () => {
    const service = createService(
      { id: 'quiz-1', userId: 1, isPublic: false, allowRetry: false },
      1,
    );

    await expect(
      service.startQuizSession(1, { quizId: 'quiz-1' }),
    ).rejects.toThrow('Quiz does not allow retries');
  });

  it('blocks quizzes when max retry attempts are exhausted', async () => {
    const service = createService(
      {
        id: 'quiz-1',
        userId: 1,
        isPublic: false,
        allowRetry: true,
        maxRetries: 2,
      },
      2,
    );

    await expect(
      service.startQuizSession(1, { quizId: 'quiz-1' }),
    ).rejects.toThrow('Quiz retry limit reached');
  });
});
