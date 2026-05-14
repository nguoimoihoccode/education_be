import { UnauthorizedException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { QuizController } from './quiz.controller';

describe('QuizController route order', () => {
  it('declares static routes before the generic quiz id route', () => {
    const routeOrder = Object.getOwnPropertyNames(QuizController.prototype)
      .filter((name) => name !== 'constructor')
      .filter((name) =>
        Reflect.hasMetadata(
          PATH_METADATA,
          QuizController.prototype[
            name as keyof typeof QuizController.prototype
          ],
        ),
      );

    const idRouteIndex = routeOrder.indexOf('getQuizById');

    expect(routeOrder.indexOf('getQuizStats')).toBeLessThan(idRouteIndex);
    expect(routeOrder.indexOf('getQuizHistory')).toBeLessThan(idRouteIndex);
    expect(routeOrder.indexOf('getAllQuizSessions')).toBeLessThan(idRouteIndex);
    expect(routeOrder.indexOf('getAllWrongAnswers')).toBeLessThan(idRouteIndex);
  });
});

describe('QuizController today plan completion', () => {
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
    const controller = new QuizController(
      quizService as any,
      educationService as any,
    );

    const result = await controller.completeQuizSession(
      { user: { sub: 42 } } as any,
      'session-1',
    );

    expect(result).toEqual({ quizId: 'quiz-1' });
    expect(
      educationService.markTodayPlanTasksCompleteByType,
    ).toHaveBeenCalledWith('42', ['quick_quiz']);
    expect(
      educationService.markTodayPlanTasksCompleteByTarget,
    ).toHaveBeenCalledWith('42', '/quiz/quiz-1');
  });

  it('rejects protected quiz actions without an authenticated user', async () => {
    const quizService = {
      getQuizStats: jest.fn(),
    };
    const educationService = {};
    const controller = new QuizController(
      quizService as any,
      educationService as any,
    );

    await expect(controller.getQuizStats({} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(quizService.getQuizStats).not.toHaveBeenCalled();
  });
});
