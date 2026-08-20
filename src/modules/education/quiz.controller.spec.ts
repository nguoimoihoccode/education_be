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
  it('delegates session completion to the orchestration service', async () => {
    const quizService = {};
    const completionService = {
      completeAndUpdatePlan: jest.fn().mockResolvedValue({ quizId: 'quiz-1' }),
    };
    const controller = new QuizController(
      quizService as any,
      completionService as any,
    );

    const result = await controller.completeQuizSession(
      { user: { sub: 42 } } as any,
      'session-1',
    );

    expect(result).toEqual({ quizId: 'quiz-1' });
    expect(completionService.completeAndUpdatePlan).toHaveBeenCalledWith(
      42,
      'session-1',
    );
  });

  it('rejects protected quiz actions without an authenticated user', async () => {
    const quizService = {
      getQuizStats: jest.fn(),
    };
    const completionService = {};
    const controller = new QuizController(
      quizService as any,
      completionService as any,
    );

    await expect(controller.getQuizStats({} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(quizService.getQuizStats).not.toHaveBeenCalled();
  });
});
