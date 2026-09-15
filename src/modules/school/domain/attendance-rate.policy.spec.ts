import { summarizeAttendance } from './attendance-rate.policy';

const facts = (spec: Array<'p' | 'a' | 'l' | 'e'>) =>
  spec.map((s) => ({
    status: ({ p: 'present', a: 'absent', l: 'late', e: 'excused' } as const)[
      s
    ],
  }));

describe('summarizeAttendance', () => {
  it('handles the empty range without dividing by zero', () => {
    expect(summarizeAttendance([])).toEqual({
      totalSessions: 0,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      attendanceRate: 0,
      unexcusedAbsences: 0,
    });
  });

  it('counts each status once', () => {
    const s = summarizeAttendance(facts(['p', 'p', 'l', 'a', 'e']));
    expect(s.totalSessions).toBe(5);
    expect(s.present).toBe(2);
    expect(s.late).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.excused).toBe(1);
  });

  it('counts late as attending (present + late) / total', () => {
    const s = summarizeAttendance(facts(['p', 'p', 'l']));
    expect(s.attendanceRate).toBe(100);
  });

  it('computes a one-decimal rate', () => {
    // 12 attended out of 13 → 92.307…% → 92.3
    const spec: Array<'p' | 'l' | 'a'> = [
      ...Array<'p'>(11).fill('p'),
      'l',
      'a',
    ];
    const s = summarizeAttendance(facts(spec));
    expect(s.attendanceRate).toBe(92.3);
  });

  it('treats excused as NOT attended but never unexcused', () => {
    const s = summarizeAttendance(facts(['p', 'e']));
    expect(s.attendanceRate).toBe(50);
    expect(s.unexcusedAbsences).toBe(0);
  });

  it('unexcusedAbsences equals the absent count only', () => {
    const s = summarizeAttendance(facts(['a', 'a', 'e', 'l', 'p']));
    expect(s.unexcusedAbsences).toBe(2);
  });
});
