import { rankCompetition, Rankable } from './rank.policy';

const r = (name: string, value: number | null): Rankable<string> => ({
  item: name,
  value,
});

describe('rank.policy (competition ranking "1224")', () => {
  it('returns empty result for no inputs', () => {
    expect(rankCompetition([])).toEqual({ rows: [], rankedCount: 0 });
  });

  it('ranks descending, 1-based', () => {
    const { rows, rankedCount } = rankCompetition([
      r('B', 8),
      r('A', 9),
      r('C', 7),
    ]);
    expect(rankedCount).toBe(3);
    expect(rows.map((x) => [x.item, x.rank])).toEqual([
      ['A', 1],
      ['B', 2],
      ['C', 3],
    ]);
  });

  it('ties share a rank and the next rank is skipped (1,1,3)', () => {
    const { rows, rankedCount } = rankCompetition([
      r('A', 8.5),
      r('B', 8.5),
      r('C', 7),
    ]);
    expect(rankedCount).toBe(3);
    expect(rows.map((x) => [x.item, x.rank])).toEqual([
      ['A', 1],
      ['B', 1],
      ['C', 3],
    ]);
  });

  it('a longer tie block skips exactly as many ranks as it covers', () => {
    // 9, 9, 9, 8 → 1, 1, 1, 4
    const { rows } = rankCompetition([
      r('A', 9),
      r('B', 9),
      r('C', 9),
      r('D', 8),
    ]);
    expect(rows.map((x) => x.rank)).toEqual([1, 1, 1, 4]);
  });

  it('null values are unranked and sink to the bottom', () => {
    const { rows, rankedCount } = rankCompetition([
      r('X', null),
      r('A', 6),
      r('Y', null),
    ]);
    expect(rankedCount).toBe(1);
    expect(rows.map((x) => [x.item, x.rank])).toEqual([
      ['A', 1],
      ['X', null],
      ['Y', null],
    ]);
  });

  it('all-null input yields zero ranked students', () => {
    const { rows, rankedCount } = rankCompetition([r('X', null), r('Y', null)]);
    expect(rankedCount).toBe(0);
    expect(rows.every((x) => x.rank === null)).toBe(true);
  });

  it('float noise from 1-decimal averages still counts as a tie', () => {
    // 0.1+0.2 !== 0.3 trong IEEE754 — EPS phải gom về đồng hạng
    const { rows } = rankCompetition([
      r('A', 0.1 + 0.2),
      r('B', 0.3),
      r('C', 0.2),
    ]);
    expect(rows.map((x) => x.rank)).toEqual([1, 1, 3]);
  });

  it('a score of 0 IS ranked (distinct from null = chưa có điểm)', () => {
    const { rows, rankedCount } = rankCompetition([r('A', 0), r('B', null)]);
    expect(rankedCount).toBe(1);
    expect(rows[0]).toEqual({ item: 'A', value: 0, rank: 1 });
  });

  it('does not mutate the input array', () => {
    const input = [r('B', 5), r('A', 9)];
    rankCompetition(input);
    expect(input.map((x) => x.item)).toEqual(['B', 'A']);
  });
});
