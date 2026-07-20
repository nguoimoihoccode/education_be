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
  remove: jest.fn(),
  save: jest.fn((value) => Promise.resolve(value)),
  createQueryBuilder: jest.fn(),
  ...overrides,
});

const createAiServiceMock = (overrides: Record<string, unknown> = {}) => ({
  completeJson: jest.fn().mockRejectedValue(new Error('AI unavailable')),
  completeText: jest.fn().mockRejectedValue(new Error('AI unavailable')),
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
      createAiServiceMock() as any,
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

describe('QuizService ownership checks', () => {
  const createService = (repositories: Record<string, any> = {}) => {
    const quizRepository = repositories.quizRepository ?? createRepository();
    const quizQuestionRepository =
      repositories.quizQuestionRepository ?? createRepository();

    return {
      service: new QuizService(
        quizRepository,
        quizQuestionRepository,
        createRepository() as any,
        createRepository() as any,
        createRepository() as any,
        createAiServiceMock() as any,
      ),
      quizRepository,
      quizQuestionRepository,
    };
  };

  const findPublicQuizUnlessOwnershipChecked = jest.fn((options) => {
    if (options?.where?.userId) {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      id: 'quiz-1',
      userId: 2,
      isPublic: true,
      questionCount: 0,
    });
  });

  it('blocks updating another user public quiz', async () => {
    const { service, quizRepository } = createService({
      quizRepository: createRepository({
        findOne: findPublicQuizUnlessOwnershipChecked,
      }),
    });

    await expect(
      service.updateQuiz('quiz-1', 1, { title: 'Changed' }),
    ).rejects.toThrow('Quiz not found');
    expect(quizRepository.save).not.toHaveBeenCalled();
  });

  it('blocks deleting another user public quiz', async () => {
    const { service, quizRepository } = createService({
      quizRepository: createRepository({
        findOne: findPublicQuizUnlessOwnershipChecked,
      }),
    });

    await expect(service.deleteQuiz('quiz-1', 1)).rejects.toThrow(
      'Quiz not found',
    );
    expect(quizRepository.remove).not.toHaveBeenCalled();
  });

  it('blocks adding questions to another user public quiz', async () => {
    const { service, quizQuestionRepository } = createService({
      quizRepository: createRepository({
        findOne: findPublicQuizUnlessOwnershipChecked,
      }),
      quizQuestionRepository: createRepository(),
    });

    await expect(
      service.createQuizQuestion(1, 'quiz-1', {
        question: 'Q?',
        type: 'MULTIPLE_CHOICE' as any,
        correctAnswer: 'A',
      }),
    ).rejects.toThrow('Quiz not found');
    expect(quizQuestionRepository.save).not.toHaveBeenCalled();
  });
});

describe('QuizService AI MCQ generation', () => {
  const flashcard = {
    id: 'fc-1',
    front: '你好',
    back: 'hello',
    example: '你好，世界',
  };

  const createServiceForMcq = (aiService: ReturnType<typeof createAiServiceMock>) => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest
        .fn()
        .mockResolvedValue([
          { answer: 'goodbye' },
          { answer: 'thanks' },
          { answer: 'please' },
        ]),
    };
    const flashcardRepository = createRepository({
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    });

    const service = new QuizService(
      createRepository() as any,
      createRepository() as any,
      createRepository() as any,
      flashcardRepository as any,
      createRepository() as any,
      aiService as any,
    );

    return { service, aiService, flashcardRepository };
  };

  it('uses AI distractors and explanation when AI returns valid data', async () => {
    const aiService = createAiServiceMock({
      completeJson: jest.fn().mockResolvedValue({
        distractors: ['goodbye', 'thanks', 'please'],
        explanation: '你好 means hello as a greeting.',
      }),
    });
    const { service } = createServiceForMcq(aiService);

    const result = await (service as any).generateMultipleChoiceQuestion(
      flashcard,
    );

    expect(aiService.completeJson).toHaveBeenCalled();
    expect(result.correctAnswer).toBe('hello');
    expect(result.explanation).toBe('你好 means hello as a greeting.');
    expect(result.options).toHaveLength(4);
    expect(result.options).toEqual(
      expect.arrayContaining(['hello', 'goodbye', 'thanks', 'please']),
    );
    expect(result.options.filter((o: string) => o === 'hello')).toHaveLength(1);
  });

  it('falls back to heuristic wrong answers when AI fails', async () => {
    const aiService = createAiServiceMock({
      completeJson: jest.fn().mockRejectedValue(new Error('timeout')),
    });
    const { service, flashcardRepository } = createServiceForMcq(aiService);

    const result = await (service as any).generateMultipleChoiceQuestion(
      flashcard,
    );

    expect(aiService.completeJson).toHaveBeenCalled();
    expect(flashcardRepository.createQueryBuilder).toHaveBeenCalled();
    expect(result.correctAnswer).toBe('hello');
    expect(result.explanation).toBe('你好，世界');
    expect(result.options).toHaveLength(4);
    expect(result.options).toEqual(
      expect.arrayContaining(['hello', 'goodbye', 'thanks', 'please']),
    );
  });

  it('falls back when AI returns invalid distractor count', async () => {
    const aiService = createAiServiceMock({
      completeJson: jest.fn().mockResolvedValue({
        distractors: ['only-one'],
        explanation: 'unused',
      }),
    });
    const { service, flashcardRepository } = createServiceForMcq(aiService);

    const result = await (service as any).generateMultipleChoiceQuestion(
      flashcard,
    );

    expect(flashcardRepository.createQueryBuilder).toHaveBeenCalled();
    expect(result.explanation).toBe('你好，世界');
    expect(result.options).toEqual(
      expect.arrayContaining(['hello', 'goodbye', 'thanks', 'please']),
    );
  });
});
