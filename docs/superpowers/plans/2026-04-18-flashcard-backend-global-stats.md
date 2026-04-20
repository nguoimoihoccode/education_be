# Flashcard Backend Global Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich backend flashcard stats responses with real global streak and XP values so the frontend can stop relying on fallback placeholders.

**Architecture:** Keep the change local to `FlashcardService` by adding small internal query helpers for user streak and total XP, then merge those values into the existing `getFlashcardStats()` response. Reuse the same enriched shape for review/global stats paths that already depend on the same service method.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Jest, TypeScript

---

### Task 1: Add a Pure Result-Shaping Helper

**Files:**
- Modify: `education_be/src/modules/education/flashcard.service.ts`
- Test: `education_be/test/unit/education/flashcard-stats.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `education_be/test/unit/education/flashcard-stats.spec.ts` with:

```ts
import { buildFlashcardStatsResult } from '../../../src/modules/education/flashcard.service';

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/unit/education/flashcard-stats.spec.ts --runInBand`
Expected: FAIL because `buildFlashcardStatsResult` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

At the bottom of `education_be/src/modules/education/flashcard.service.ts`, add:

```ts
export interface FlashcardStatsResultInput {
  totalFlashcards: number;
  statusStats: Record<string, number>;
  dueCount: number;
  totalReviews: number;
  correctRate: number;
  currentStreak: number;
  longestStreak: number;
  totalXp: number;
}

export function buildFlashcardStatsResult(input: FlashcardStatsResultInput) {
  return {
    totalFlashcards: input.totalFlashcards,
    statusStats: input.statusStats,
    dueCount: input.dueCount,
    totalReviews: input.totalReviews,
    correctRate: input.correctRate,
    currentStreak: input.currentStreak,
    longestStreak: input.longestStreak,
    totalXp: input.totalXp,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/unit/education/flashcard-stats.spec.ts --runInBand`
Expected: PASS.

### Task 2: Query Streak and XP Sources in FlashcardService

**Files:**
- Modify: `education_be/src/modules/education/flashcard.service.ts`
- Reference: `education_be/src/modules/education/entities/review-session.entity.ts`
- Reference: `education_be/src/modules/education/entities/user-streak.entity.ts`

- [ ] **Step 1: Write the failing test**

Add to `test/unit/education/flashcard-stats.spec.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest test/unit/education/flashcard-stats.spec.ts --runInBand`
Expected: FAIL because the new helper/type is incomplete or not exported correctly.

- [ ] **Step 3: Write minimal implementation**

In `FlashcardService`, add small internal helpers:

```ts
private async getUserFlashcardStreakStats(userId: number) {
  const streak = await this.userStreakRepository.findOne({
    where: { userId: String(userId) },
  });

  return {
    currentStreak: streak?.currentStreak ?? 0,
    longestStreak: streak?.longestStreak ?? 0,
  };
}

private async getUserFlashcardXpTotal(userId: number) {
  const xp = await this.reviewSessionRepository
    .createQueryBuilder('session')
    .select('SUM(session.xpEarned)', 'total')
    .where('session.userId = :userId', { userId })
    .getRawOne();

  return parseInt(xp?.total || '0');
}
```

Update `getFlashcardStats()` to fetch and merge these values:

```ts
const [{ currentStreak, longestStreak }, totalXp] = await Promise.all([
  this.getUserFlashcardStreakStats(userId),
  this.getUserFlashcardXpTotal(userId),
]);

return buildFlashcardStatsResult({
  totalFlashcards,
  statusStats: statusStats.reduce((acc, item) => {
    acc[item.status] = parseInt(item.count);
    return acc;
  }, {}),
  dueCount,
  totalReviews: parseInt(totalReviews?.total || '0'),
  correctRate: parseFloat(correctRate?.rate || '0'),
  currentStreak,
  longestStreak,
  totalXp,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest test/unit/education/flashcard-stats.spec.ts --runInBand`
Expected: PASS.

### Task 3: Verify Build and Service Integration

**Files:**
- Verify: `education_be/src/modules/education/flashcard.service.ts`
- Verify: `education_be/test/unit/education/flashcard-stats.spec.ts`

- [ ] **Step 1: Run targeted test**

Run:

```bash
npx jest test/unit/education/flashcard-stats.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run backend build**

Run:

```bash
npm run build
```

Expected: NestJS TypeScript build succeeds.

- [ ] **Step 3: Manual API verification**

Verify through Swagger or an authenticated request that `/flashcards/stats` now includes:

```json
{
  "currentStreak": 0,
  "longestStreak": 0,
  "totalXp": 0
}
```

and that users with real streak/session data receive non-zero values.
