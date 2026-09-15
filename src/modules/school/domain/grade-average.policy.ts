/**
 * Pure grade-average policy (docs/SCHOOL_PLATFORM_PLAN.md §3.5, Phase 4).
 *
 * Quy chế VN thu gọn: TB giữa kỳ = trung bình CÓ HỆ SỐ của các đầu điểm
 * thường xuyên/xuyên suốt (miệng ×1, 15p ×1, 45p ×2 — coefficient lưu
 * trên từng entry nên trung tâm ngoại ngữ map sang quiz tùy ý được,
 * chỉ cần ghi hệ số khác khi nhập). `final` KHÔNG tham gia giữa kỳ.
 * TB cả năm = (giữaKỳ × 2 + cuốiKỳ) / 3 — chỉ tính khi có cả hai; mỗi
 * thành phần được làm tròn 1 chữ số trước khi tổ hợp (như sổ điểm điện
 * tử VN). Input đã được caller lọc theo schoolId/term trước (rule D1).
 */

import { GradeTestType } from '../entities/grade-entry.entity';

export interface GradeFact {
  testType: GradeTestType;
  coefficient: number;
  score: number;
}

export interface GradeAverages {
  /** TB cộng thô theo từng loại đầu điểm (1 chữ số); thiếu loại → undefined */
  byType: Partial<Record<GradeTestType, number>>;
  /** TB có hệ số của oral/15min/45min; null nếu chưa có đầu điểm nào */
  midterm: number | null;
  /** TB của các đầu điểm final; null nếu chưa có */
  final: number | null;
  /** (midterm×2 + final)/3; null khi thiếu một trong hai */
  year: number | null;
  totalEntries: number;
}

/** Làm tròn 1 chữ số thập phân (0..10 domain — không cần xử lý NaN). */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Trung bình có hệ số; null khi tập rỗng hoặc tổng hệ số = 0. */
function weightedAvg(entries: GradeFact[]): number | null {
  let weightedSum = 0;
  let sumCoefficient = 0;
  for (const e of entries) {
    weightedSum += e.score * e.coefficient;
    sumCoefficient += e.coefficient;
  }
  if (sumCoefficient <= 0) return null;
  return round1(weightedSum / sumCoefficient);
}

export function computeGradeAverages(entries: GradeFact[]): GradeAverages {
  const byType: Partial<Record<GradeTestType, number>> = {};
  for (const type of Object.values(GradeTestType)) {
    const of = entries.filter((e) => e.testType === type);
    if (of.length > 0) {
      const sum = of.reduce((acc, e) => acc + e.score, 0);
      byType[type] = round1(sum / of.length);
    }
  }

  const midtermEntries = entries.filter(
    (e) => e.testType !== GradeTestType.FINAL,
  );
  const finalEntries = entries.filter(
    (e) => e.testType === GradeTestType.FINAL,
  );

  const midterm = weightedAvg(midtermEntries);
  const final = weightedAvg(finalEntries);
  const year =
    midterm !== null && final !== null
      ? round1((midterm * 2 + final) / 3)
      : null;

  return { byType, midterm, final, year, totalEntries: entries.length };
}
