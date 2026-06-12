import {
  flashcardReviewActivitySourceKey,
  lessonActivitySourceKey,
  quizActivitySourceKey,
} from './activity-source-key';

describe('activity source keys', () => {
  it('includes the lesson and user in the canonical lesson source key', () => {
    expect(lessonActivitySourceKey('lesson-1', 7)).toBe(
      'lesson:lesson-1:user:7',
    );
  });

  it('creates canonical quiz and flashcard review source keys', () => {
    expect(quizActivitySourceKey('quiz-session-1')).toBe('quiz:quiz-session-1');
    expect(flashcardReviewActivitySourceKey('review-session-1')).toBe(
      'flashcard:review-session-1',
    );
  });
});
