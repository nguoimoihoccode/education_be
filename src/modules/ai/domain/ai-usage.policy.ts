/**
 * Token usage and cost of one OpenAI-compatible `/chat/completions` call.
 *
 * Money is integer micro-USD. A price is USD per million tokens, so
 * `tokens × price` is already micro-USD. The cost is computed when the call is
 * logged, with the price in force then: a later price change never rewrites
 * history. Without a full price, or when the provider omits usage, the cost is
 * `null` (unknown), never a guess.
 */
export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatPricing {
  inputUsdPerMillion: number | null;
  outputUsdPerMillion: number | null;
}

const count = (value: unknown): number | null =>
  Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;

/** Reads `usage` from a chat completion; `null` when it is missing or malformed. */
export function readUsage(data: unknown): ChatUsage | null {
  const usage = (data as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const promptTokens = count(usage.prompt_tokens);
  const completionTokens = count(usage.completion_tokens);
  if (promptTokens === null || completionTokens === null) return null;
  const total = count(usage.total_tokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens: total ?? promptTokens + completionTokens,
  };
}

const price = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;

export function costMicros(
  usage: ChatUsage | null,
  pricing: ChatPricing,
): number | null {
  const input = price(pricing.inputUsdPerMillion);
  const output = price(pricing.outputUsdPerMillion);
  if (!usage || input === null || output === null) return null;
  return Math.round(
    usage.promptTokens * input + usage.completionTokens * output,
  );
}

/** Feature tags written to `ai_usage_logs.feature`. */
export type AiUsageFeature =
  | 'tutor_chat'
  | 'quiz_generate'
  | 'quiz_explain'
  | 'coach_summary'
  | 'vocab_enrich'
  | 'other';
