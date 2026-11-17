/**
 * Model spend split by where it was used, never merged into one opaque
 * number: grading (scanned exams) is its own source, and every other AI
 * feature is another. Each source keeps its own known cost, its unknown calls
 * (no price or no usage reported) and, for grading, the reserved upper bound.
 * Money is integer micro-USD.
 */
export const COST_SOURCES = [
  { key: 'assessment_grading', label: 'Chấm bài thi', group: 'grading' },
  { key: 'tutor_chat', label: 'Gia sư AI', group: 'ai' },
  { key: 'quiz_generate', label: 'Tạo quiz', group: 'ai' },
  { key: 'quiz_explain', label: 'Giải thích đáp án', group: 'ai' },
  { key: 'coach_summary', label: 'Tóm tắt coach', group: 'ai' },
  { key: 'vocab_enrich', label: 'Làm giàu từ vựng', group: 'ai' },
  { key: 'other', label: 'Khác', group: 'ai' },
] as const;

export type CostSourceKey = (typeof COST_SOURCES)[number]['key'];

/** One aggregated row: a source (and optionally a part of it) on one day. */
export interface CostRow {
  source: string;
  part?: string | null;
  day: string;
  calls: number;
  errorCalls: number;
  inputTokens: number;
  outputTokens: number;
  knownCostMicros: number;
  unknownCostCalls: number;
  unknownReservedMicros: number;
}

export interface CostTotals {
  calls: number;
  errorCalls: number;
  inputTokens: number;
  outputTokens: number;
  knownCostMicros: number;
  knownCostUsd: number;
  unknownCostCalls: number;
  unknownReservedMicros: number;
  upperBoundCostMicros: number;
  upperBoundCostUsd: number;
}

const usd = (micros: number) => Math.round(micros) / 1_000_000;

function totals(rows: CostRow[]): CostTotals {
  const t = {
    calls: 0,
    errorCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    knownCostMicros: 0,
    unknownCostCalls: 0,
    unknownReservedMicros: 0,
  };
  for (const r of rows)
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += r[k] || 0;
  const upper = t.knownCostMicros + t.unknownReservedMicros;
  return {
    ...t,
    knownCostUsd: usd(t.knownCostMicros),
    upperBoundCostMicros: upper,
    upperBoundCostUsd: usd(upper),
  };
}

const groupBy = (rows: CostRow[], key: (r: CostRow) => string) => {
  const out = new Map<string, CostRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(r);
  }
  return out;
};

/** Share of the known total, 0–100 with one decimal; null when nothing is known. */
const share = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

export function buildCostOverview(rows: CostRow[]) {
  const known = new Set<string>(COST_SOURCES.map((s) => s.key));
  const catalog = [
    ...COST_SOURCES,
    // A feature tag the catalog does not know yet still gets its own source.
    ...[...new Set(rows.map((r) => r.source))]
      .filter((k) => !known.has(k))
      .sort()
      .map((key) => ({ key, label: key, group: 'ai' as const })),
  ];
  const total = totals(rows);
  const bySource = groupBy(rows, (r) => r.source);
  const days = [...new Set(rows.map((r) => r.day))].sort();
  const sources = catalog.map((s) => {
    const list = bySource.get(s.key) ?? [];
    const t = totals(list);
    const perDay = groupBy(list, (r) => r.day);
    const parts = groupBy(
      list.filter((r) => r.part),
      (r) => r.part!,
    );
    return {
      key: s.key,
      label: s.label,
      group: s.group,
      ...t,
      shareOfKnownCost: share(t.knownCostMicros, total.knownCostMicros),
      byDay: [...perDay]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, r]) => ({ day, ...totals(r) })),
      parts: [...parts]
        .map(([part, r]) => ({ part, ...totals(r) }))
        .sort(
          (a, b) => b.knownCostMicros - a.knownCostMicros || b.calls - a.calls,
        ),
    };
  });
  return {
    currency: 'USD' as const,
    total,
    sources,
    byDay: days.map((day) => {
      const list = rows.filter((r) => r.day === day);
      const per = groupBy(list, (r) => r.source);
      return {
        day,
        ...totals(list),
        bySource: Object.fromEntries(
          [...per].map(([k, r]) => [k, totals(r).knownCostMicros]),
        ),
      };
    }),
  };
}
