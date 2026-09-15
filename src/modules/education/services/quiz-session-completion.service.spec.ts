import { QuizSessionCompletionService } from './quiz-session-completion.service';

const createMocks = () => {
  const quizService = {
    completeQuizSession: jest.fn().mockResolvedValue({
      id: 'session-1',
      quizId: 'quiz-1',
      score: 87,
    }),
  };
  const educationService = {
    markTodayPlanTasksCompleteByTarget: jest.fn().mockResolvedValue(undefined),
    markTodayPlanTasksCompleteByType: jest.fn().mockResolvedValue(undefined),
  };
  const homeworkService = {
    recordQuizGrade: jest.fn().mockResolvedValue(null),
  };
  return { quizService, educationService, homeworkService };
};

describe('QuizSessionCompletionService', () => {
  it('awaits today plan task marking before returning completed quiz result', async () => {
    const { quizService, educationService, homeworkService } = createMocks();
    const service = new QuizSessionCompletionService(
      quizService as any,
      educationService as any,
      homeworkService as any,
    );

    const result = await service.completeAndUpdatePlan(42, 'session-1');

    expect(quizService.completeQuizSession).toHaveBeenCalledWith(42, {
      sessionId: 'session-1',
    });
    expect(
      educationService.markTodayPlanTasksCompleteByType,
    ).toHaveBeenCalledWith('42', ['quick_quiz']);
    expect(
      educationService.markTodayPlanTasksCompleteByTarget,
    ).toHaveBeenCalledWith('42', '/quiz/quiz-1');
    expect(result).toEqual({ id: 'session-1', quizId: 'quiz-1', score: 87 });
  });

  it('feeds the school grade bridge with the completed session facts', async () => {
    const { quizService, educationService, homeworkService } = createMocks();
    const service = new QuizSessionCompletionService(
      quizService as any,
      educationService as any,
      homeworkService as any,
    );

    await service.completeAndUpdatePlan(42, 'session-1', 'hw-1');

    expect(homeworkService.recordQuizGrade).toHaveBeenCalledWith({
      userId: 42,
      sessionId: 'session-1',
      quizId: 'quiz-1',
      scorePercent: 87,
      homeworkId: 'hw-1',
    });
  });

  it('a school-side failure never breaks the quiz completion flow', async () => {
    const { quizService, educationService, homeworkService } = createMocks();
    homeworkService.recordQuizGrade.mockRejectedValue(new Error('db exploded'));
    const service = new QuizSessionCompletionService(
      quizService as any,
      educationService as any,
      homeworkService as any,
    );

    const result = await service.completeAndUpdatePlan(42, 'session-1');

    expect(result).toEqual({ id: 'session-1', quizId: 'quiz-1', score: 87 });
  });
});
