import { summarizeCost, type CostCall } from './cost-report';

const call = (over: Partial<CostCall>): CostCall => ({
  state: 'succeeded',
  purpose: 'image_reader',
  provider: 'google',
  modelRequested: 'gemini',
  attemptNumber: 1,
  inputUsage: { tokens: 1000 },
  outputUsage: { tokens: 200 },
  reservedCostMicros: 5000,
  actualCostMicros: 1200,
  ...over,
});

describe('summarizeCost', () => {
  it('adds tokens and known cost, and splits by purpose, model and retry', () => {
    const r = summarizeCost(
      [
        call({}),
        call({ attemptNumber: 2, actualCostMicros: 800 }),
        call({
          purpose: 'text_grader',
          provider: 'openai',
          modelRequested: 'gpt',
          actualCostMicros: 3000,
        }),
      ],
      2,
    );
    expect(r).toMatchObject({
      currency: 'USD',
      calls: 3,
      inputTokens: 3000,
      outputTokens: 600,
      knownCostMicros: 5000,
      knownCostUsd: 0.005,
      unknownCostCalls: 0,
      upperBoundCostMicros: 5000,
      knownCostPerFinalizedMicros: 2500,
    });
    expect(r.retries).toMatchObject({ calls: 1, knownCostMicros: 800 });
    expect(r.byPurpose.map((p) => [p.purpose, p.knownCostMicros])).toEqual([
      ['text_grader', 3000],
      ['image_reader', 2000],
    ]);
    expect(r.byModel[0]).toMatchObject({ provider: 'openai', model: 'gpt' });
  });

  it('never folds an unknown cost into the known total; its reservation is an upper bound', () => {
    const r = summarizeCost([
      call({ actualCostMicros: null, outputUsage: {} }),
      call({ state: 'unknown', actualCostMicros: null, inputUsage: {} }),
      call({ state: 'reserved', actualCostMicros: null, inputUsage: null }),
      call({ state: 'not_sent', actualCostMicros: 0, reservedCostMicros: 9 }),
    ]);
    expect(r).toMatchObject({
      calls: 4,
      knownCostMicros: 0,
      unknownCostCalls: 3,
      unknownReservedMicros: 15000,
      upperBoundCostMicros: 15000,
      knownCostPerFinalizedMicros: null,
      byState: { succeeded: 1, unknown: 1, reserved: 1, not_sent: 1 },
    });
    expect(r.inputTokens).toBe(2000);
    expect(r.outputTokens).toBe(600);
  });

  it('ignores malformed token counts', () => {
    const r = summarizeCost([
      call({ inputUsage: { tokens: -5 }, outputUsage: { tokens: 1.5 } }),
    ]);
    expect([r.inputTokens, r.outputTokens]).toEqual([0, 0]);
  });

  it('produces identical tallies when identical-bucket calls are pre-grouped in SQL', () => {
    const raw = [
      call({ actualCostMicros: 1200 }),
      call({ actualCostMicros: 800 }),
      call({
        state: 'unknown',
        actualCostMicros: null,
        reservedCostMicros: 4000,
      }),
      call({
        state: 'unknown',
        actualCostMicros: null,
        reservedCostMicros: 5000,
      }),
    ];
    const grouped = [
      call({
        count: 2,
        inputUsage: { tokens: 2000 },
        outputUsage: { tokens: 400 },
        reservedCostMicros: 10000,
        actualCostMicros: 2000,
      }),
      call({
        count: 2,
        state: 'unknown',
        inputUsage: { tokens: 2000 },
        outputUsage: { tokens: 400 },
        reservedCostMicros: 9000,
        actualCostMicros: null,
      }),
    ];
    expect(summarizeCost(grouped, 4)).toEqual(summarizeCost(raw, 4));
  });
});
