import { buildCostOverview, CostRow } from './cost-overview';

const row = (r: Partial<CostRow>): CostRow => ({
  source: 'tutor_chat',
  day: '2026-03-01',
  calls: 1,
  errorCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  knownCostMicros: 0,
  unknownCostCalls: 0,
  unknownReservedMicros: 0,
  ...r,
});

describe('buildCostOverview', () => {
  it('keeps every source apart and only adds them in the total', () => {
    const o = buildCostOverview([
      row({
        source: 'assessment_grading',
        part: 'vision_extract',
        knownCostMicros: 3000,
        inputTokens: 100,
      }),
      row({
        source: 'assessment_grading',
        part: 'text_grade',
        day: '2026-03-02',
        knownCostMicros: 1000,
        unknownCostCalls: 1,
        unknownReservedMicros: 500,
      }),
      row({ source: 'tutor_chat', part: 'm', knownCostMicros: 1000 }),
    ]);
    expect(o.total).toMatchObject({
      calls: 3,
      knownCostMicros: 5000,
      knownCostUsd: 0.005,
      unknownCostCalls: 1,
      upperBoundCostMicros: 5500,
    });
    const grading = o.sources.find((s) => s.key === 'assessment_grading')!;
    expect(grading).toMatchObject({
      label: 'Chấm bài thi',
      knownCostMicros: 4000,
      upperBoundCostMicros: 4500,
      shareOfKnownCost: 80,
    });
    expect(grading.parts.map((p) => [p.part, p.knownCostMicros])).toEqual([
      ['vision_extract', 3000],
      ['text_grade', 1000],
    ]);
    expect(grading.byDay.map((d) => d.day)).toEqual([
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(o.byDay[0].bySource).toEqual({
      assessment_grading: 3000,
      tutor_chat: 1000,
    });
  });
  it('lists every catalog source even with no calls, and unknown tags too', () => {
    const o = buildCostOverview([row({ source: 'new_feature', calls: 2 })]);
    expect(o.sources[0].key).toBe('assessment_grading');
    expect(o.sources.find((s) => s.key === 'quiz_generate')).toMatchObject({
      calls: 0,
      shareOfKnownCost: null,
    });
    expect(o.sources.at(-1)).toMatchObject({ key: 'new_feature', calls: 2 });
  });
});
