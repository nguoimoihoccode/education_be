import { BadRequestException } from '@nestjs/common';
import { QuizSessionService } from './quiz-session.service';
import { Quiz, QuizQuestion, QuizSession } from '../entities';

const createRepository = (): Record<string, any> => {
  const repository: Record<string, any> = {
    count: jest.fn(),
    create: jest.fn((value) => value),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  repository.manager = {
    transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
      work({ getRepository: () => repository }),
    ),
  };
  return repository;
};

describe('QuizSessionService session locking', () => {
  const baseSession = () => ({
    id: 'session-1',
    userId: 1,
    quizId: 'quiz-1',
    completed: false,
    totalPoints: 10,
    earnedPoints: 4,
    answers: [],
    questionOrder: ['q-1', 'q-2'],
    startedAt: new Date(Date.now() - 60_000),
  });

  const createService = (session: Record<string, any>) => {
    const quizRepository = createRepository();
    const quizQuestionRepository = createRepository();
    const quizSessionRepository = createRepository();
    quizSessionRepository.findOne.mockResolvedValue(session);
    // Route each transaction entity to its mock repository.
    quizSessionRepository.manager = {
      transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
        work({
          getRepository: (entity: unknown) =>
            entity === Quiz
              ? quizRepository
              : entity === QuizQuestion
                ? quizQuestionRepository
                : quizSessionRepository,
        }),
      ),
    };
    const service = new QuizSessionService(
      quizRepository as never,
      quizQuestionRepository as never,
      quizSessionRepository as never,
    );
    return {
      service,
      quizRepository,
      quizQuestionRepository,
      quizSessionRepository,
    };
  };

  it('grades an answer and persists it under a pessimistic write lock', async () => {
    const {
      service,
      quizRepository,
      quizQuestionRepository,
      quizSessionRepository,
    } = createService(baseSession());
    quizRepository.findOne.mockResolvedValue({
      id: 'quiz-1',
      showCorrectAnswer: true,
    });
    quizQuestionRepository.findOne.mockResolvedValue({
      id: 'q-1',
      quizId: 'quiz-1',
      correctAnswer: 'A',
      points: 5,
      explanation: 'because',
    });

    const result = await service.submitQuizAnswer(1, 'session-1', {
      questionId: 'q-1',
      answer: 'A',
      timeSpent: 12,
    } as never);

    expect(result).toMatchObject({ isCorrect: true, points: 5 });
    expect(quizSessionRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    const saved = quizSessionRepository.save.mock.calls[0][0];
    expect(saved.answers).toHaveLength(1);
    // earnedPoints is recomputed from the answers array (points of this answer).
    expect(saved.earnedPoints).toBe(5);
  });

  it('rejects a duplicate answer without saving the session', async () => {
    const { service, quizQuestionRepository, quizSessionRepository } =
      createService({
        ...baseSession(),
        answers: [
          {
            questionId: 'q-1',
            userAnswer: 'A',
            isCorrect: true,
            timeSpent: 3,
            points: 5,
          },
        ],
        earnedPoints: 5,
      });
    quizQuestionRepository.findOne.mockResolvedValue({
      id: 'q-1',
      quizId: 'quiz-1',
      correctAnswer: 'A',
      points: 5,
    });

    await expect(
      service.submitQuizAnswer(1, 'session-1', {
        questionId: 'q-1',
        answer: 'B',
      } as never),
    ).rejects.toThrow(BadRequestException);
    expect(quizSessionRepository.save).not.toHaveBeenCalled();
  });

  it('refuses to complete an already completed session (idempotent completion)', async () => {
    const { service, quizSessionRepository } = createService({
      ...baseSession(),
      completed: true,
    });

    await expect(
      service.completeQuizSession(1, { sessionId: 'session-1' } as never),
    ).rejects.toThrow(BadRequestException);
    expect(quizSessionRepository.save).not.toHaveBeenCalled();
  });

  it('completes the session with score, duration, and pass flag in one transaction', async () => {
    const { service, quizRepository, quizSessionRepository } =
      createService(baseSession());
    quizRepository.findOne.mockResolvedValue({
      id: 'quiz-1',
      passingScore: 50,
    });

    const session = await service.completeQuizSession(1, {
      sessionId: 'session-1',
    } as never);

    expect(session.completed).toBe(true);
    expect(session.score).toBe(40);
    expect(session.passed).toBe(false);
    expect(session.timeSpent).toBeGreaterThanOrEqual(60);
    expect(quizSessionRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });
});
