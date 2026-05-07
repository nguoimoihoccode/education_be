import {
  calculateFinalQuizScore,
  gradeQuizAnswer,
} from './quiz-grading.policy';

describe('quiz grading policy', () => {
  it('grades case-insensitive string answers', () => {
    expect(
      gradeQuizAnswer({
        correctAnswer: 'Hello',
        userAnswer: ' hello ',
        points: 2,
      }),
    ).toEqual({
      isCorrect: true,
      points: 2,
    });
  });

  it('calculates rounded score percentage', () => {
    expect(calculateFinalQuizScore({ earnedPoints: 7, totalPoints: 9 })).toBe(
      78,
    );
  });

  it('returns zero when total points are zero', () => {
    expect(calculateFinalQuizScore({ earnedPoints: 7, totalPoints: 0 })).toBe(
      0,
    );
  });
});
