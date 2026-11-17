import { costMicros, readUsage } from './ai-usage.policy';

describe('ai usage policy', () => {
  it('reads OpenAI-compatible usage and fills a missing total', () => {
    expect(
      readUsage({ usage: { prompt_tokens: 120, completion_tokens: 30 } }),
    ).toEqual({ promptTokens: 120, completionTokens: 30, totalTokens: 150 });
    expect(
      readUsage({
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 9 },
      }),
    ).toMatchObject({ totalTokens: 9 });
  });
  it('returns null for missing or malformed usage', () => {
    expect(readUsage({})).toBeNull();
    expect(readUsage(null)).toBeNull();
    expect(
      readUsage({ usage: { prompt_tokens: -1, completion_tokens: 2 } }),
    ).toBeNull();
    expect(
      readUsage({ usage: { prompt_tokens: '5', completion_tokens: 2 } }),
    ).toBeNull();
  });
  it('prices tokens in micro-USD and stays unknown without a full price', () => {
    const usage = {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    };
    // $0.59 / $0.79 per million tokens.
    expect(
      costMicros(usage, {
        inputUsdPerMillion: 0.59,
        outputUsdPerMillion: 0.79,
      }),
    ).toBe(985);
    expect(
      costMicros(usage, {
        inputUsdPerMillion: 0.59,
        outputUsdPerMillion: null,
      }),
    ).toBeNull();
    expect(
      costMicros(null, { inputUsdPerMillion: 1, outputUsdPerMillion: 1 }),
    ).toBeNull();
    expect(
      costMicros(usage, { inputUsdPerMillion: 0, outputUsdPerMillion: 0 }),
    ).toBe(0);
  });
});
