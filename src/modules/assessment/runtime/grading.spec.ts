import { validateGrades, shouldAudit } from './grading';
const context = {
  examVersionId: '22222222-2222-4222-8222-222222222222',
  submissionId: '33333333-3333-4333-8333-333333333333',
  inputRevision: 1,
};
const q = {
  questionKey: 'II.1',
  kind: 'rubric_text',
  text: 'Question',
  maxUnits: 1000,
  criteria: [{ id: 'a', maxUnits: 1000 }],
};
const output = (points: number | null, evidence = ['r1']) => ({
  schemaVersion: 1,
  ...context,
  results: [
    {
      questionKey: 'II.1',
      criterionGrades: [
        {
          criterionId: 'a',
          pointsUnits: points,
          reason: 'Observed answer',
          evidenceRegionIds: evidence,
        },
      ],
      blockingCodes: [],
    },
  ],
});
describe('grading evidence contract', () => {
  it('rejects points above the approved criterion and forged region ids', () => {
    expect(() =>
      validateGrades(output(1001), context, [q], new Set(['r1'])),
    ).toThrow('criterion_score_invalid');
    expect(() =>
      validateGrades(
        output(500, ['other-student']),
        context,
        [q],
        new Set(['r1']),
      ),
    ).toThrow('grading_evidence_invalid');
  });
  it('preserves unknown criterion points instead of turning them into zero', () => {
    expect(
      validateGrades(output(null, []), context, [q], new Set(['r1']))[0]
        .earnedUnits,
    ).toBeNull();
  });
  it('rejects stale job context', () => {
    expect(() =>
      validateGrades(
        output(500),
        { ...context, inputRevision: 2 },
        [q],
        new Set(['r1']),
      ),
    ).toThrow('grading_context_mismatch');
  });
  it('samples audit consistently across retries', () => {
    expect(shouldAudit('secret', 'assessment:student', 0.05)).toBe(
      shouldAudit('secret', 'assessment:student', 0.05),
    );
    expect(shouldAudit('secret', 'a', 0)).toBe(false);
    expect(shouldAudit('secret', 'a', 1)).toBe(true);
  });
});
