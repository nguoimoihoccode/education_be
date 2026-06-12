export const lessonActivitySourceKey = (
  lessonId: string,
  userId: number,
): string => `lesson:${lessonId}:user:${userId}`;

export const quizActivitySourceKey = (sessionId: string): string =>
  `quiz:${sessionId}`;

export const flashcardReviewActivitySourceKey = (sessionId: string): string =>
  `flashcard:${sessionId}`;
