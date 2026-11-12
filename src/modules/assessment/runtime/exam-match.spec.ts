import { examEvidence } from './exam-match';
import type { Template } from './grading';

const template: Template = {
  examCode: '102',
  maxScoreUnits: 250,
  questions: [
    {
      questionKey: 'I.1',
      kind: 'single_choice',
      text: 'Tính 5 − 2?',
      maxUnits: 250,
      options: [
        { id: 'A', text: '3' },
        { id: 'B', text: '7' },
      ],
    },
  ],
};
const full = {
  questionKey: 'I.1',
  text: 'Tính 5 - 2',
  options: template.questions[0].options,
};

it('matches printed questions and options while retaining mathematical signs', () => {
  expect(examEvidence(template, [full])).toBe('match');
  expect(examEvidence(template, [{ ...full, text: 'Tính 5 + 2?' }])).toBe(
    'conflict',
  );
  expect(
    examEvidence(template, [{ ...full, text: 'Khổ giấy A4 là bao nhiêu?' }]),
  ).toBe('conflict');
});

it('distinguishes superscripts from an ordinary digit', () => {
  const exponential = {
    ...template,
    questions: [{ ...template.questions[0], text: 'Tính 2²' }],
  };
  expect(examEvidence(exponential, [{ ...full, text: 'Tính 2^{2}' }])).toBe(
    'match',
  );
  expect(examEvidence(exponential, [{ ...full, text: 'Tính 22' }])).toBe(
    'conflict',
  );
});

it('rejects reordered options even if the question wording and exam code are unchanged', () => {
  expect(
    examEvidence(template, [
      {
        ...full,
        options: [
          { id: 'A', text: '7' },
          { id: 'B', text: '3' },
        ],
      },
    ]),
  ).toBe('conflict');
});

it('distinguishes missing evidence from contradictory evidence', () => {
  expect(examEvidence(template, [])).toBe('incomplete');
  expect(
    examEvidence(template, [{ questionKey: 'I.1', text: full.text }]),
  ).toBe('incomplete');
  expect(
    examEvidence(template, [{ ...full, options: [{ id: 'A', text: '7' }] }]),
  ).toBe('conflict');
});
