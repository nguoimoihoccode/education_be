import { GradeTestType } from '../entities/grade-entry.entity';
import { computeGradeAverages, GradeFact } from './grade-average.policy';

const g = (
  testType: GradeTestType,
  coefficient: number,
  score: number,
): GradeFact => ({ testType, coefficient, score });

describe('grade-average.policy', () => {
  it('returns nulls and empty byType when there are no entries', () => {
    expect(computeGradeAverages([])).toEqual({
      byType: {},
      midterm: null,
      final: null,
      year: null,
      totalEntries: 0,
    });
  });

  it('midterm is the coefficient-weighted average of oral/15min/45min', () => {
    // (8×1 + 6×1 + 10×2) / (1+1+2) = 34/4 = 8.5
    const result = computeGradeAverages([
      g(GradeTestType.ORAL, 1, 8),
      g(GradeTestType.MIN15, 1, 6),
      g(GradeTestType.MIN45, 2, 10),
    ]);
    expect(result.midterm).toBe(8.5);
    expect(result.final).toBeNull();
    expect(result.year).toBeNull();
  });

  it('excludes final entries from the midterm average', () => {
    const result = computeGradeAverages([
      g(GradeTestType.MIN15, 1, 7),
      g(GradeTestType.FINAL, 2, 3), // không được ảnh hưởng giữa kỳ
    ]);
    expect(result.midterm).toBe(7);
  });

  it('year = (midterm×2 + final)/3, each part rounded to 1 decimal first', () => {
    // midterm: (6.5×1)/1 = 6.5 ; final = 8
    // year = (6.5×2 + 8)/3 = 21/3 = 7
    const result = computeGradeAverages([
      g(GradeTestType.MIN15, 1, 6.5),
      g(GradeTestType.FINAL, 2, 8),
    ]);
    expect(result.midterm).toBe(6.5);
    expect(result.final).toBe(8);
    expect(result.year).toBe(7);
  });

  it('rounds every published number to 1 decimal', () => {
    // midterm: (7×1 + 8×1 + 6×2)/4 = 27/4 = 6.75 → 6.8 (round-half-up)
    // year: (6.8×2 + 0)/3 — final = 0 → 4.533… → 4.5
    const result = computeGradeAverages([
      g(GradeTestType.MIN15, 1, 7),
      g(GradeTestType.MIN15, 1, 8),
      g(GradeTestType.MIN45, 2, 6),
      g(GradeTestType.FINAL, 2, 0),
    ]);
    expect(result.midterm).toBe(6.8);
    expect(result.year).toBe(4.5);
  });

  it('byType is the raw mean per test type, independent of coefficient', () => {
    const result = computeGradeAverages([
      g(GradeTestType.MIN45, 2, 10),
      g(GradeTestType.MIN45, 2, 4),
      g(GradeTestType.ORAL, 1, 9),
    ]);
    expect(result.byType[GradeTestType.MIN45]).toBe(7);
    expect(result.byType[GradeTestType.ORAL]).toBe(9);
    expect(result.byType[GradeTestType.MIN15]).toBeUndefined();
    expect(result.byType[GradeTestType.FINAL]).toBeUndefined();
  });

  it('treats multiple final entries as a weighted final average', () => {
    // (9×1 + 6×2)/3 = 7
    const result = computeGradeAverages([
      g(GradeTestType.MIN15, 1, 5),
      g(GradeTestType.FINAL, 1, 9),
      g(GradeTestType.FINAL, 2, 6),
    ]);
    expect(result.midterm).toBe(5);
    expect(result.final).toBe(7);
    expect(result.year).toBe(5.7); // (5×2 + 7)/3 = 17/3 = 5.666… → 5.7
  });

  it('zero-coefficient entries cannot divide by zero', () => {
    const result = computeGradeAverages([
      g(GradeTestType.MIN15, 0, 8),
      g(GradeTestType.FINAL, 0, 9),
    ]);
    expect(result.midterm).toBeNull();
    expect(result.final).toBeNull();
    expect(result.year).toBeNull();
    expect(result.byType[GradeTestType.MIN15]).toBe(8);
  });

  it('counts total entries for the gradebook header', () => {
    const result = computeGradeAverages([
      g(GradeTestType.ORAL, 1, 8),
      g(GradeTestType.MIN15, 1, 8),
    ]);
    expect(result.totalEntries).toBe(2);
  });
});
