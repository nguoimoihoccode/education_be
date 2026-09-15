/**
 * Pure competition-ranking policy (xếp hạng học sinh, Phase 4 mở rộng).
 *
 * Hạng theo kiểu "1224" cạnh tranh: điểm bằng nhau → ĐỒNG HẠNG, hạng liền
 * sau bị bỏ trống (8.5, 8.5, 7 → 1, 1, 3). Giá trị null (chưa có điểm) →
 * KHÔNG xếp hạng, luôn nằm cuối danh sách. Điểm đã được tính bằng
 * grade-average.policy và lọc theo schoolId/term trước (rule D1) — policy
 * này chỉ sắp hạng, không chạm DB.
 */

export interface Rankable<T> {
  item: T;
  /** điểm dùng để xếp hạng (TB cả năm hoặc giữa kỳ, thang 0..10); null = chưa có */
  value: number | null;
}

export interface Ranked<T> extends Rankable<T> {
  /** 1-based, đồng hạng trùng số; null = chưa xếp hạng được */
  rank: number | null;
}

export interface RankingResult<T> {
  /** đã sắp xếp: có điểm giảm dần trước, chưa có điểm (rank null) xuống cuối */
  rows: Ranked<T>[];
  /** số học sinh được xếp hạng (value !== null) */
  rankedCount: number;
}

/** Dung sai so sánh điểm: mọi điểm đều round 1 chữ số, nhưng float cộng lại
 * có thể lệch 1e-15 — coi như bằng nhau trong phạm vi này. */
const EPS = 1e-9;

export function rankCompetition<T>(inputs: Rankable<T>[]): RankingResult<T> {
  const sorted = [...inputs].sort((a, b) => {
    if (a.value === null && b.value === null) return 0;
    if (a.value === null) return 1;
    if (b.value === null) return -1;
    return b.value - a.value;
  });

  const rows: Ranked<T>[] = [];
  let rankedCount = 0;
  let previous: number | null = null;
  let previousRank = 0;
  sorted.forEach((entry, index) => {
    if (entry.value === null) {
      rows.push({ ...entry, rank: null });
      return;
    }
    rankedCount += 1;
    // đồng hạng khi sát nhau trong dung sai; ngược lại hạng = vị trí 1-based
    const tied = previous !== null && Math.abs(entry.value - previous) < EPS;
    const rank = tied ? previousRank : index + 1;
    rows.push({ ...entry, rank });
    previous = entry.value;
    previousRank = rank;
  });

  return { rows, rankedCount };
}
