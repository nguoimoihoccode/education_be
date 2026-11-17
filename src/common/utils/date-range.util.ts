const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseStrictIsoDayMs(value: unknown): number | null {
  if (typeof value !== 'string' || !DAY.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  // Rejects calendar overflows that V8 rolls forward (e.g. 2026-02-31 -> 2026-03-03).
  if (new Date(ms).toISOString().slice(0, 10) !== value) return null;
  return ms;
}

/**
 * Validates an inclusive `[from, to]` YYYY-MM-DD calendar range of at most
 * `maxDays` days (`from === to` has span 0).
 */
export function isValidIsoDayRange(
  from: unknown,
  to: unknown,
  maxDays: number,
): from is string {
  const fromMs = parseStrictIsoDayMs(from);
  const toMs = parseStrictIsoDayMs(to);
  if (fromMs === null || toMs === null) return false;
  const span = (toMs - fromMs) / 86_400_000;
  return span >= 0 && span <= maxDays;
}

/**
 * Sargable timestamptz range predicate for an inclusive `[from, to]` local-day
 * window in `Asia/Ho_Chi_Minh`, allowing PostgreSQL to use B-tree indexes on
 * `column` instead of wrapping the column in `AT TIME ZONE`.
 */
export function vnDayRangeWhere(
  column: string,
  fromParam: string,
  toParam: string,
): string {
  return `${column} >= (${fromParam}::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh') AND ${column} < ((${toParam}::date + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`;
}
