/**
 * How often the teacher kept the AI's proposed score. Each pair is the first
 * worker review of a submission's current input and the review the teacher
 * approved or published. Only AI-sourced, scored questions are compared; rule
 * scores (multiple choice) and questions the AI left ungraded are not.
 *
 * A teacher who approves the AI's own revision without opening it agrees by
 * construction, so bulk approval would inflate the figure. Those pairs are
 * counted (`approvedAsProposed`) and `reviewedByTeacher` repeats the tally over
 * only the pairs where the teacher saved a revision of their own.
 */
type Result = {
  questionKey?: unknown;
  source?: unknown;
  earnedUnits?: unknown;
  criteria?: unknown;
};
export type AgreementPair = {
  proposed: unknown;
  decided: unknown;
  /** The decided review is the AI's revision itself, approved unchanged. */
  approvedAsProposed?: boolean;
};
type Tally = { compared: number; agreed: number; absDiffUnits: number };
export type AiAgreement = {
  decidedSubmissions: number;
  approvedAsProposed: number;
  compared: number;
  agreed: number;
  meanAbsDiffUnits: number | null;
  byConfidence: Record<'high' | 'medium' | 'low' | 'unknown', Tally>;
  byQuestion: (Tally & { questionKey: string })[];
  reviewedByTeacher: Tally & { submissions: number };
};
const rank = { low: 0, medium: 1, high: 2 } as const;
/** The least certain criterion decides how sure the AI was about the question. */
function confidence(result: Result): keyof AiAgreement['byConfidence'] {
  const levels = (Array.isArray(result.criteria) ? result.criteria : [])
    .map((c: { confidence?: unknown }) => c?.confidence)
    .filter((c): c is keyof typeof rank => typeof c === 'string' && c in rank);
  if (!levels.length) return 'unknown';
  return levels.reduce((a, b) => (rank[b] < rank[a] ? b : a));
}
const list = (value: unknown): Result[] =>
  Array.isArray(value)
    ? value.filter((r): r is Result => !!r && typeof r === 'object')
    : [];
const empty = (): Tally => ({ compared: 0, agreed: 0, absDiffUnits: 0 });
function add(t: Tally, diff: number) {
  t.compared += 1;
  t.absDiffUnits += diff;
  if (diff === 0) t.agreed += 1;
}
export function compareAiToTeacher(pairs: AgreementPair[]): AiAgreement {
  const total = empty();
  const byConfidence = {
    high: empty(),
    medium: empty(),
    low: empty(),
    unknown: empty(),
  };
  const byQuestion = new Map<string, Tally>();
  const edited = empty();
  for (const pair of pairs) {
    const decided = list(pair.decided);
    for (const ai of list(pair.proposed)) {
      if (
        ai.source !== 'ai' ||
        typeof ai.questionKey !== 'string' ||
        typeof ai.earnedUnits !== 'number'
      )
        continue;
      const final = decided.find((r) => r.questionKey === ai.questionKey);
      if (typeof final?.earnedUnits !== 'number') continue;
      const diff = Math.abs(final.earnedUnits - ai.earnedUnits);
      add(total, diff);
      add(byConfidence[confidence(ai)], diff);
      if (!pair.approvedAsProposed) add(edited, diff);
      if (!byQuestion.has(ai.questionKey))
        byQuestion.set(ai.questionKey, empty());
      add(byQuestion.get(ai.questionKey)!, diff);
    }
  }
  return {
    decidedSubmissions: pairs.length,
    approvedAsProposed: pairs.filter((p) => p.approvedAsProposed).length,
    compared: total.compared,
    agreed: total.agreed,
    meanAbsDiffUnits: total.compared
      ? Math.round(total.absDiffUnits / total.compared)
      : null,
    byConfidence,
    byQuestion: [...byQuestion]
      .map(([questionKey, t]) => ({ questionKey, ...t }))
      .sort((a, b) => a.questionKey.localeCompare(b.questionKey)),
    reviewedByTeacher: {
      submissions: pairs.filter((p) => !p.approvedAsProposed).length,
      ...edited,
    },
  };
}
