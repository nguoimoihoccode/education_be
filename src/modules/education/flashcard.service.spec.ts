import { buildFlashcardStatsResult } from './flashcard.service';

describe('buildFlashcardStatsResult', () => {
  it('adds streak and xp values to the existing stats payload', () => {
    expect(
      buildFlashcardStatsResult({
        totalFlashcards: 10,
        statusStats: { NEW: 3, LEARNING: 4, MASTERED: 3 },
        dueCount: 2,
        totalReviews: 15,
        correctRate: 0.8,
        currentStreak: 5,
        longestStreak: 9,
        totalXp: 120,
      }),
    ).toEqual({
      totalFlashcards: 10,
      statusStats: { NEW: 3, LEARNING: 4, MASTERED: 3 },
      dueCount: 2,
      totalReviews: 15,
      correctRate: 0.8,
      currentStreak: 5,
      longestStreak: 9,
      totalXp: 120,
    });
  });

  it('defaults streak and xp to zero when sources are missing', () => {
    expect(
      buildFlashcardStatsResult({
        totalFlashcards: 0,
        statusStats: {},
        dueCount: 0,
        totalReviews: 0,
        correctRate: 0,
        currentStreak: 0,
        longestStreak: 0,
        totalXp: 0,
      }),
    ).toEqual({
      totalFlashcards: 0,
      statusStats: {},
      dueCount: 0,
      totalReviews: 0,
      correctRate: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalXp: 0,
    });
  });

  it('keeps totalXp from the provided aggregate source of truth', () => {
    expect(
      buildFlashcardStatsResult({
        totalFlashcards: 3,
        statusStats: { MASTERED: 3 },
        dueCount: 0,
        totalReviews: 9,
        correctRate: 1,
        currentStreak: 4,
        longestStreak: 7,
        totalXp: 230,
      }).totalXp,
    ).toBe(230);
  });
});
