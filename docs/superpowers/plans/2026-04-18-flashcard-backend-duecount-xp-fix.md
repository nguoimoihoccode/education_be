# Flashcard Backend Due Count and XP Source Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix backend flashcard stats so `dueCount` matches the real review queue and `totalXp` comes from `UserStreak.totalXp` instead of review session aggregation.

**Architecture:** Keep the fix local to `FlashcardService` by changing the due-count queries to use the same `<= now` semantics as `getFlashcardsToReview()`, and by swapping the XP source helper from `ReviewSession` aggregation to `UserStreak`. Preserve the existing response shape so frontend code does not need a contract change.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Jest, TypeScript

---

### Task 1: Update XP Source Helper

**Files:**
- Modify: `education_be/src/modules/education/flashcard.service.ts`
- Modify: `education_be/src/modules/education/flashcard.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `education_be/src/modules/education/flashcard.service.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/modules/education/flashcard.service.spec.ts --runInBand`
Expected: FAIL if the new test is added before implementation is adjusted.

- [ ] **Step 3: Write minimal implementation**

In `education_be/src/modules/education/flashcard.service.ts`, replace `getUserFlashcardXpTotal()` with:

```ts
private async getUserFlashcardXpTotal(userId: number) {
  const streak = await this.userStreakRepository.findOne({
    where: { userId: String(userId) },
  });

  return streak?.totalXp ?? 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/modules/education/flashcard.service.spec.ts --runInBand`
Expected: PASS.

### Task 2: Align Due Count with Review Queue

**Files:**
- Modify: `education_be/src/modules/education/flashcard.service.ts`

- [ ] **Step 1: Write the failing test**

Use the plan’s verification step plus code inspection as the regression guard here, since the current service unit tests are pure helper tests and this repo does not yet have a query-mocked service test harness for `FlashcardService` statistics queries.

Document the intended behavior directly in code comments near the updated query:

```ts
// Due count must match getFlashcardsToReview(): cards reviewable now use nextReview <= now
```

- [ ] **Step 2: Run test to verify current behavior is still only helper-verified**

Run: `npx jest src/modules/education/flashcard.service.spec.ts --runInBand`
Expected: PASS for helper tests only; query semantics remain to be updated in implementation.

- [ ] **Step 3: Write minimal implementation**

In `education_be/src/modules/education/flashcard.service.ts`, change both `dueCount` queries.

For global stats:

```ts
const dueCount = await this.userFlashcardRepository.count({
  where: {
    userId,
    nextReview: LessThanOrEqual(new Date()),
  },
});
```

For deck stats:

```ts
const dueCount = await this.userFlashcardRepository.count({
  where: {
    userId,
    deckId,
    nextReview: LessThanOrEqual(new Date()),
  },
});
```

Also update the import list at the top of the file to include `LessThanOrEqual`.

- [ ] **Step 4: Run verification to confirm implementation still compiles**

Run: `npx jest src/modules/education/flashcard.service.spec.ts --runInBand`
Expected: PASS.

### Task 3: Verify Backend Build

**Files:**
- Verify: `education_be/src/modules/education/flashcard.service.ts`
- Verify: `education_be/src/modules/education/flashcard.service.spec.ts`

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx jest src/modules/education/flashcard.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
npm run build
```

Expected: NestJS TypeScript build succeeds.

- [ ] **Step 3: Manual API verification**

Verify that:

```text
1. /flashcards/stats returns currentStreak, longestStreak, totalXp.
2. totalXp now matches UserStreak.totalXp.
3. dueCount semantics match the actual review queue (cards reviewable now).
4. /flashcards/decks/:id/stats uses the same due semantics.
```
