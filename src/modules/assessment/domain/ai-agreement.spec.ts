import { compareAiToTeacher } from './ai-agreement';

describe('compareAiToTeacher', () => {
  const ai = (
    questionKey: string,
    earnedUnits: number | null,
    confidence?: string,
  ) => ({
    questionKey,
    source: 'ai',
    earnedUnits,
    criteria: confidence ? [{ confidence: 'high' }, { confidence }] : [],
  });
  it('counts kept and changed AI scores, grouped by the least certain criterion', () => {
    const result = compareAiToTeacher([
      {
        proposed: [
          ai('II.1', 500, 'high'),
          ai('II.2', 1000, 'low'),
          { questionKey: 'I.1', source: 'rule', earnedUnits: 250 },
        ],
        decided: [
          { questionKey: 'II.1', source: 'ai', earnedUnits: 500 },
          { questionKey: 'II.2', source: 'teacher', earnedUnits: 500 },
          { questionKey: 'I.1', source: 'rule', earnedUnits: 250 },
        ],
      },
      {
        proposed: [ai('II.1', 500)],
        decided: [{ questionKey: 'II.1', earnedUnits: 500 }],
      },
    ]);
    expect(result).toMatchObject({
      decidedSubmissions: 2,
      compared: 3,
      agreed: 2,
      meanAbsDiffUnits: 167,
    });
    expect(result.byConfidence.high).toEqual({
      compared: 1,
      agreed: 1,
      absDiffUnits: 0,
    });
    expect(result.byConfidence.low).toEqual({
      compared: 1,
      agreed: 0,
      absDiffUnits: 500,
    });
    expect(result.byConfidence.unknown.compared).toBe(1);
    expect(
      result.byQuestion.map((q) => [q.questionKey, q.agreed, q.compared]),
    ).toEqual([
      ['II.1', 2, 2],
      ['II.2', 0, 1],
    ]);
  });
  it('skips questions the AI left ungraded or the teacher has not scored', () => {
    const result = compareAiToTeacher([
      {
        proposed: [ai('II.3', null), ai('II.1', 500)],
        decided: [{ questionKey: 'II.1', earnedUnits: null }],
      },
    ]);
    expect(result).toMatchObject({ compared: 0, meanAbsDiffUnits: null });
  });
  it('reports AI revisions approved unchanged apart from teacher-edited ones', () => {
    const result = compareAiToTeacher([
      {
        proposed: [ai('II.1', 500)],
        decided: [ai('II.1', 500)],
        approvedAsProposed: true,
      },
      {
        proposed: [ai('II.1', 1000)],
        decided: [{ questionKey: 'II.1', earnedUnits: 500 }],
      },
    ]);
    expect(result).toMatchObject({
      decidedSubmissions: 2,
      approvedAsProposed: 1,
      compared: 2,
      agreed: 1,
    });
    expect(result.reviewedByTeacher).toEqual({
      submissions: 1,
      compared: 1,
      agreed: 0,
      absDiffUnits: 500,
    });
  });
});
