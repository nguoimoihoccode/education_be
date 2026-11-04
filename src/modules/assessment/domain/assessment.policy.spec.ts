import templateFixture from '../../../../docs/assessment/contracts/technology-8-template.example.json';
import {
  normalizeScore,
  scoreObjective,
  assertExamDocument,
  assertReviewPublishable,
  assertRevision,
} from './assessment.policy';
describe('assessment invariants', () => {
  it('uses half-up integer scoring without per-criterion rounding', () => {
    expect(normalizeScore(7250, 10000)).toBe(73);
    expect(normalizeScore(250, 1000)).toBe(25);
    for (const [earned, max] of [
      [-1, 1],
      [2, 1],
      [0, 0],
      [1.5, 10],
      [1, 1000001],
    ])
      expect(() => normalizeScore(earned, max)).toThrow();
  });
  it('rejects stale revisions', () => {
    expect(() => assertRevision(3, 2)).toThrow();
    expect(() => assertRevision(3, 3)).not.toThrow();
  });
  it('requires unique question keys and exact max-unit sum', () => {
    const doc = {
      schemaVersion: 1,
      subject: 'Math',
      grade: 8,
      examCode: '101',
      declaredExamPageCount: 1,
      pointScale: 1000,
      maxScoreUnits: 1000,
      gradingDefaults: {
        blankScoreUnits: 0,
        carryForwardErrorPolicy: 'no_duplicate_penalty',
        rounding: { mode: 'half_up', normalizeTo: 10, targetDecimals: 1 },
      },
      questions: [
        {
          questionKey: 'I.1',
          kind: 'single_choice',
          text: 'Question',
          maxUnits: 1000,
          sourceRegionIds: [],
          options: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
          ],
          answerKey: 'a',
        },
      ],
    };
    expect(() => assertExamDocument(doc, 1000)).not.toThrow();
    expect(() =>
      assertExamDocument(
        { ...doc, questions: [...doc.questions, ...doc.questions] },
        1000,
      ),
    ).toThrow();
    expect(() => assertExamDocument(doc, 2000)).toThrow();
  });
  it('blocks partial, stale, and unresolved reviews', () => {
    const review = {
      earnedUnits: 500,
      ungradedMaxUnits: 0,
      inputManifest: { inputRevision: 3, examVersionId: 'v' },
      flags: [],
    };
    expect(() =>
      assertReviewPublishable(
        review,
        { inputRevision: 3, examVersionId: 'v' },
        1000,
      ),
    ).not.toThrow();
    expect(() =>
      assertReviewPublishable(
        { ...review, ungradedMaxUnits: 1 },
        { inputRevision: 3, examVersionId: 'v' },
        1000,
      ),
    ).toThrow();
    expect(() =>
      assertReviewPublishable(
        review,
        { inputRevision: 4, examVersionId: 'v' },
        1000,
      ),
    ).toThrow();
    expect(() =>
      assertReviewPublishable(
        {
          ...review,
          flags: [{ severity: 'blocking', resolutionState: 'open' }],
        },
        { inputRevision: 3, examVersionId: 'v' },
        1000,
      ),
    ).toThrow();
  });
});

describe('canonical template and deterministic objective grading', () => {
  const fixture = templateFixture;
  it('accepts the canonical unknown-key draft but never approves it', () => {
    expect(() => assertExamDocument(fixture, 10000, false)).not.toThrow();
    expect(() => assertExamDocument(fixture, 10000, true)).toThrow();
  });
});

it('does not turn an unrecognized choice into a wrong answer worth zero', () => {
  expect(
    scoreObjective(
      {
        kind: 'single_choice',
        maxUnits: 250,
        options: [{ id: 'A' }, { id: 'B' }],
        answerKey: 'A',
      },
      { observationState: 'readable', content: { selectedOptionId: 'Z' } },
    ),
  ).toBeNull();
});
