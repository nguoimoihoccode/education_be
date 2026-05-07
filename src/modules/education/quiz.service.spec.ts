import {
  buildQuizSessionQuestionOrder,
  calculateQuizSessionProgress,
} from './quiz.service';

describe('quiz session helpers', () => {
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
});
