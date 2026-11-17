import { isValidIsoDayRange, vnDayRangeWhere } from './date-range.util';

describe('date-range.util', () => {
  it('accepts valid inclusive calendar ranges up to maxDays', () => {
    expect(isValidIsoDayRange('2026-03-02', '2026-03-02', 92)).toBe(true);
    expect(isValidIsoDayRange('2024-02-29', '2024-03-01', 92)).toBe(true);
    expect(isValidIsoDayRange('2026-01-01', '2027-01-02', 366)).toBe(true);
  });

  it('rejects impossible calendar dates, reversed ranges, and over-wide spans', () => {
    expect(isValidIsoDayRange('2026-02-01', '2026-02-29', 92)).toBe(false);
    expect(isValidIsoDayRange('2026-02-01', '2026-02-31', 92)).toBe(false);
    expect(isValidIsoDayRange('2026-04-31', '2026-05-01', 92)).toBe(false);
    expect(isValidIsoDayRange('2026-03-05', '2026-03-02', 92)).toBe(false);
    expect(isValidIsoDayRange('2026-01-01', '2027-01-03', 366)).toBe(false);
    expect(isValidIsoDayRange(undefined, '2026-03-02', 92)).toBe(false);
  });

  it('builds a sargable timestamptz predicate for Asia/Ho_Chi_Minh days', () => {
    expect(vnDayRangeWhere('c.created_at', '$2', '$3')).toBe(
      "c.created_at >= ($2::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND c.created_at < (($3::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')",
    );
  });
});
