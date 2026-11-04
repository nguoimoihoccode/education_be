import Ajv from 'ajv';
import schema from './exam-template.schema.json';
const validateDocument = new Ajv({ allErrors: true, strict: false }).compile(
  schema,
);
import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
export function assessmentError(
  code: string,
  message: string,
  status = 400,
): never {
  throw new HttpException({ error: code, message }, status);
}
export function hash(value: unknown): string {
  const stable = (v: any): any =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, stable(v[k])]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}
export function assertRevision(actual: unknown, expected: unknown) {
  if (actual !== expected)
    assessmentError(
      'ASSESSMENT_STALE_REVISION',
      'The displayed revision is no longer current',
      409,
    );
}
export function normalizeScore(earned: number, max: number): number {
  if (
    !Number.isSafeInteger(earned) ||
    !Number.isSafeInteger(max) ||
    earned < 0 ||
    max <= 0 ||
    earned > max ||
    max > 1000000
  )
    assessmentError(
      'ASSESSMENT_INVALID_INPUT',
      'Invalid integer scoring units',
    );
  return Math.floor((2 * earned * 100 + max) / (2 * max));
}
export function assertExamDocument(
  doc: any,
  max: number,
  approved = true,
): void {
  if (!validateDocument(doc))
    assessmentError(
      'ASSESSMENT_INVALID_INPUT',
      'Exam document does not match the v1 schema: ' +
        JSON.stringify(validateDocument.errors?.slice(0, 3)),
    );
  if (
    doc?.schemaVersion !== 1 ||
    !Array.isArray(doc.questions) ||
    !doc.questions.length ||
    doc.maxScoreUnits !== max
  )
    assessmentError('ASSESSMENT_INVALID_INPUT', 'Invalid exam document');
  const keys = new Set<string>();
  let total = 0;
  for (const q of doc.questions) {
    if (
      !/^[A-Za-z0-9_.-]{1,100}$/.test(q.questionKey) ||
      keys.has(q.questionKey) ||
      !Number.isInteger(q.maxUnits) ||
      q.maxUnits <= 0
    )
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'Invalid question key or score',
      );
    keys.add(q.questionKey);
    total += q.maxUnits;
    if (!approved) continue;
    if (q.kind === 'single_choice') {
      const ids = (q.options ?? []).map((o: any) => o.id);
      if (
        ids.length < 2 ||
        new Set(ids).size !== ids.length ||
        !ids.includes(q.answerKey)
      )
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Invalid choice answer key',
        );
    } else if (q.kind === 'true_false_group') {
      const statements = q.statements ?? [];
      if (
        !statements.length ||
        statements.some((s: any) => typeof q.answerKey?.[s.id] !== 'boolean')
      )
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Invalid true/false answer key',
        );
      const p = q.scoringPolicy;
      if (
        !p ||
        !['per_statement', 'count_map'].includes(p.kind) ||
        Object.keys(q.answerKey).length !== statements.length ||
        new Set(statements.map((s: any) => s.id)).size !== statements.length
      )
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Invalid true/false policy',
        );
      if (
        p.kind === 'per_statement' &&
        (!Number.isInteger(p.unitsPerCorrect) ||
          p.unitsPerCorrect * statements.length !== q.maxUnits)
      )
        assessmentError(
          'ASSESSMENT_INVALID_INPUT',
          'Per statement units do not match question max',
        );
      if (
        p?.kind === 'count_map' &&
        (p.unitsByCorrectCount?.length !== statements.length + 1 ||
          p.unitsByCorrectCount.some(
            (n: number, i: number, a: number[]) =>
              !Number.isInteger(n) ||
              n < 0 ||
              n > q.maxUnits ||
              (i > 0 && n < a[i - 1]),
          ))
      )
        assessmentError('ASSESSMENT_INVALID_INPUT', 'Invalid count map');
    } else if (
      ['rubric_text', 'rubric_table', 'rubric_drawing'].includes(q.kind)
    ) {
      const criteria = q.criteria ?? [];
      if (
        !criteria.length ||
        criteria.reduce((n: number, c: any) => n + c.maxUnits, 0) !==
          q.maxUnits ||
        criteria.some(
          (c: any) => !c.id || !Number.isInteger(c.maxUnits) || c.maxUnits < 0,
        ) ||
        new Set(criteria.map((c: any) => c.id)).size !== criteria.length
      )
        assessmentError('ASSESSMENT_INVALID_INPUT', 'Invalid rubric criteria');
    } else
      assessmentError('ASSESSMENT_INVALID_INPUT', 'Unsupported question kind');
  }
  if (total !== max)
    assessmentError(
      'ASSESSMENT_INVALID_INPUT',
      'Question max units do not match assessment',
    );
  normalizeScore(0, max);
}
export function assertReviewPublishable(
  review: any,
  submission: any,
  max: number,
): void {
  if (
    review.ungradedMaxUnits !== 0 ||
    review.earnedUnits === null ||
    review.flags?.some(
      (f: any) => f.severity === 'blocking' && f.resolutionState !== 'resolved',
    )
  )
    assessmentError(
      'ASSESSMENT_FINALIZATION_BLOCKED',
      'Resolve all blocking flags and ungraded answers',
      409,
    );
  assertRevision(review.inputManifest?.inputRevision, submission.inputRevision);
  assertRevision(review.inputManifest?.examVersionId, submission.examVersionId);
  normalizeScore(review.earnedUnits, max);
}
/** Rule-only score. Unknown observations remain ungraded rather than silently becoming zero. */
export function scoreObjective(question: any, answer: any): number | null {
  if (answer.observationState === 'confirmed_blank') return 0;
  if (answer.observationState !== 'readable') return null;
  const content = answer.content;
  if (question.kind === 'single_choice')
    return content.ambiguityCodes?.length ||
      typeof content.selectedOptionId !== 'string' ||
      !question.options?.some(
        (option: { id: string }) => option.id === content.selectedOptionId,
      )
      ? null
      : content.selectedOptionId === question.answerKey
        ? question.maxUnits
        : 0;
  if (question.kind === 'true_false_group') {
    const ids = question.statements.map((s: any) => s.id);
    const values = content.statements ?? content.values ?? content;
    if (ids.some((id: string) => typeof values[id] !== 'boolean')) return null;
    const correct = ids.filter(
      (id: string) => values[id] === question.answerKey[id],
    ).length;
    if (question.scoringPolicy?.kind === 'count_map')
      return question.scoringPolicy.unitsByCorrectCount[correct];
    const per = question.scoringPolicy.unitsPerCorrect;
    if (!Number.isInteger(per))
      assessmentError(
        'ASSESSMENT_INVALID_INPUT',
        'Per statement units must be integral',
      );
    return correct * per;
  }
  return null;
}
export function summarizeResults(results: any[], maxUnits: number) {
  let earnedUnits = 0,
    ungradedMaxUnits = 0;
  for (const r of results) {
    if (r.earnedUnits === null || r.earnedUnits === undefined)
      ungradedMaxUnits += r.maxUnits;
    else {
      normalizeScore(r.earnedUnits, r.maxUnits);
      earnedUnits += r.earnedUnits;
    }
  }
  if (results.reduce((n, r) => n + r.maxUnits, 0) !== maxUnits)
    assessmentError('ASSESSMENT_INVALID_INPUT', 'Incomplete result manifest');
  return { earnedUnits, ungradedMaxUnits };
}
