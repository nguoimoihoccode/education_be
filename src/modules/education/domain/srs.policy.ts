export type SrsStatus = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface SrsReviewInput {
  quality: number;
  easeFactor: number;
  interval: number;
  repetitions: number;
}

export interface SrsReviewResult {
  easeFactor: number;
  interval: number;
  repetitions: number;
  status: SrsStatus;
}

export function calculateSrsReview(input: SrsReviewInput): SrsReviewResult {
  let interval = input.interval;
  let repetitions = input.repetitions;

  if (input.quality >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(input.interval * input.easeFactor);
    }
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  const easeFactor = Math.max(
    1.3,
    input.easeFactor +
      (0.1 - (5 - input.quality) * (0.08 + (5 - input.quality) * 0.02)),
  );

  let status: SrsStatus = 'new';
  if (repetitions >= 5 && interval >= 21) {
    status = 'mastered';
  } else if (repetitions >= 2) {
    status = 'reviewing';
  } else if (repetitions >= 1) {
    status = 'learning';
  }

  return {
    easeFactor,
    interval,
    repetitions,
    status,
  };
}

export function nextReviewDate(now: Date, intervalDays: number): Date {
  return new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);
}
