# Flashcard Backend Due Count and XP Source Fix Design

## Goal

Fix two backend flashcard stats correctness issues:

- `dueCount` should match the real review queue semantics
- `totalXp` should come from a stable aggregate source of truth

## Current Problems

### Due Count Semantics

- `getFlashcardStats()` and `getDeckStats()` currently count flashcards with `nextReview >= now`
- `getFlashcardsToReview()` uses `nextReview <= now`
- This means the dashboard stats and the actual review queue can disagree

### Total XP Source

- `totalXp` is currently derived from summing `ReviewSession.xpEarned`
- `xpEarned` depends on session fields that are not the clearest source of truth for a global XP total
- The system already has a dedicated aggregate field in `UserStreak.totalXp`

## Chosen Approach

Keep the scope small and fix both issues directly in `FlashcardService`.

- Change flashcard stats due counts to use the same `<= now` semantics as the review queue
- Change global `totalXp` to read from `UserStreak.totalXp`

## Scope

### Fix Due Count

Apply the same due semantics to:

- `getFlashcardStats()`
- `getDeckStats()`

Expected meaning of `dueCount`:

- flashcards that are reviewable now

### Fix Total XP Source

For global flashcard stats:

- use `UserStreak.totalXp`

If the user has no streak row yet, return:

- `totalXp: 0`

## Non-Goals

- No changes to review session XP calculation in this task
- No changes to deck-level accuracy in this task
- No frontend changes in this spec
- No schema or migration changes

## Testing

- Extend the existing backend flashcard stats unit test coverage for the result-shaping helper if needed.
- Verify backend build passes.
- Manually verify `/flashcards/stats` and `/flashcards/decks/:id/stats` now align with the review queue behavior.
