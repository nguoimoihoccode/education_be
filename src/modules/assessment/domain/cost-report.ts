/**
 * Token and money accounting over provider calls (design §3: report the total
 * and the cost per paper ready to publish, retries included).
 *
 * Money is integer micro-USD, as the worker records it. A call is:
 * - known: `actual_cost_micros` set (a `not_sent` call costs 0 by definition);
 * - unknown: sent, but the provider did not report full usage, or the outcome
 *   is unclear (`unknown`, a `reserved` call still running or interrupted).
 *   Its reservation is an upper bound and is reported apart, never added to the
 *   known total, so the report never claims a precision it does not have.
 */
export interface CostCall {
  /** Number of identical-bucket calls when pre-aggregated in SQL (defaults to 1). */
  count?: number;
  state: string;
  purpose: string;
  provider: string;
  modelRequested: string;
  attemptNumber: number;
  inputUsage?: { tokens?: number } | null;
  outputUsage?: { tokens?: number } | null;
  reservedCostMicros: number;
  actualCostMicros: number | null;
}

export interface CostTally {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  knownCostMicros: number;
  unknownCostCalls: number;
  unknownReservedMicros: number;
}

const empty = (): CostTally => ({
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  knownCostMicros: 0,
  unknownCostCalls: 0,
  unknownReservedMicros: 0,
});

const tokens = (usage: CostCall['inputUsage']): number => {
  const n = usage?.tokens;
  return Number.isSafeInteger(n) && (n as number) > 0 ? (n as number) : 0;
};

function add(t: CostTally, c: CostCall): void {
  const n = c.count ?? 1;
  t.calls += n;
  t.inputTokens += tokens(c.inputUsage);
  t.outputTokens += tokens(c.outputUsage);
  if (c.state === 'not_sent') return;
  if (c.actualCostMicros !== null && c.actualCostMicros !== undefined)
    t.knownCostMicros += c.actualCostMicros;
  else {
    t.unknownCostCalls += n;
    t.unknownReservedMicros += c.reservedCostMicros ?? 0;
  }
}

/** Micro-USD to a USD amount with 6 decimals, for display only. */
export const microsToUsd = (micros: number): number =>
  Math.round(micros) / 1_000_000;

export function summarizeCost(calls: CostCall[], finalizedSubmissions = 0) {
  const total = empty();
  const retries = empty();
  const byPurpose = new Map<string, CostTally>();
  const byModel = new Map<string, CostTally & { provider: string }>();
  const byState: Record<string, number> = {};
  for (const c of calls) {
    add(total, c);
    if (c.attemptNumber > 1) add(retries, c);
    byState[c.state] = (byState[c.state] ?? 0) + (c.count ?? 1);
    if (!byPurpose.has(c.purpose)) byPurpose.set(c.purpose, empty());
    add(byPurpose.get(c.purpose)!, c);
    const key = `${c.provider}/${c.modelRequested}`;
    if (!byModel.has(key))
      byModel.set(key, { ...empty(), provider: c.provider });
    add(byModel.get(key)!, c);
  }
  const perFinalized = (micros: number) =>
    finalizedSubmissions > 0 ? Math.round(micros / finalizedSubmissions) : null;
  const known = total.knownCostMicros;
  const upper = known + total.unknownReservedMicros;
  return {
    currency: 'USD' as const,
    ...total,
    knownCostUsd: microsToUsd(known),
    upperBoundCostMicros: upper,
    upperBoundCostUsd: microsToUsd(upper),
    finalizedSubmissions,
    knownCostPerFinalizedMicros: perFinalized(known),
    upperBoundCostPerFinalizedMicros: perFinalized(upper),
    retries,
    byState,
    byPurpose: [...byPurpose]
      .map(([purpose, t]) => ({ purpose, ...t }))
      .sort(
        (a, b) => b.knownCostMicros - a.knownCostMicros || b.calls - a.calls,
      ),
    byModel: [...byModel]
      .map(([key, t]) => ({ model: key.slice(t.provider.length + 1), ...t }))
      .sort(
        (a, b) => b.knownCostMicros - a.knownCostMicros || b.calls - a.calls,
      ),
  };
}
