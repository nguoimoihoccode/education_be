# Flashcard Backend Global Stats Design

## Goal

Extend the backend flashcard stats responses so the frontend can show real global streak and XP metrics instead of fallback placeholders.

## Current State

- `FlashcardService.getStats()` currently returns:
  - `totalFlashcards`
  - `statusStats`
  - `dueCount`
  - `totalReviews`
  - `correctRate`
- `FlashcardService.getDeckStats()` currently returns:
  - `deck`
  - `totalFlashcards`
  - `statusStats`
  - `dueCount`
- The frontend flashcard stats UI has historically wanted:
  - `currentStreak`
  - `longestStreak`
  - `totalXp`
- The backend already has the underlying data sources:
  - `UserStreak` for streak values
  - `ReviewSession.xpEarned` for earned XP

## Chosen Approach

Keep the existing flashcard stats endpoints and enrich their response payloads with global metrics that the backend can already calculate from existing tables.

Specifically:

- enrich `GET /flashcards/stats`
- enrich `GET /flashcards/review/stats`

Do not expand deck stats in this task.

## Scope

### Add Global Streak Values

For the current user, include:

- `currentStreak`
- `longestStreak`

Source of truth:

- `edu_user_streaks` via `UserStreak`

If no row exists for the user yet, return:

- `currentStreak: 0`
- `longestStreak: 0`

### Add Global XP Total

For the current user, include:

- `totalXp`

Source of truth:

- sum of `xpEarned` across flashcard `ReviewSession` rows for the user

If no rows exist, return:

- `totalXp: 0`

## Response Shape

`getStats()` should continue returning the existing fields and add:

- `currentStreak`
- `longestStreak`
- `totalXp`

The same enriched shape should be used anywhere the service powers review/global flashcard stats endpoints.

## Non-Goals

- No changes to `getDeckStats()` in this task
- No deck-level accuracy calculation
- No schema or migration changes
- No frontend implementation in this spec

## Testing

- Add service-level tests for the enriched stats result if suitable existing test patterns exist.
- At minimum, verify backend build and relevant tests pass.
- Verify that missing `UserStreak` and missing `ReviewSession` data return `0` values rather than failing.
