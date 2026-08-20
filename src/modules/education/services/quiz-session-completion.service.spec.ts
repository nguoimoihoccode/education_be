import { QuizSessionCompletionService } from './quiz-session-completion.service';

describe('QuizSessionCompletionService', () => {
  it('awaits today plan task marking before returning completed quiz result', async () => {
    const quizService = {
      completeQuizSession: jest.fn().mockResolvedValue({ quizId: 'quiz-1' }),
    };
    const educationService = {
      markTodayPlanTasksCompleteByTarget: jest
        .fn()
        .mockResolvedValue(undefined),
      markTodayPlanTasksCompleteByType: jest.fn().mockResolvedValue(undefined),
    };
    const service = new QuizSessionCompletionService(
      quizService as any,
      educationService as any,
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
    expect(result).toEqual({ quizId: 'quiz-1' });
  });
});
