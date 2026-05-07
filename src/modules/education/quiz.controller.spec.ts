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
