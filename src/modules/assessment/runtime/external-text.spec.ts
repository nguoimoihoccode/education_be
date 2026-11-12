import {
  containsRosterIdentity,
  requestExternalTextGrade,
  textPayload,
  validateExternalGrades,
} from './external-text';

const question = {
  kind: 'rubric_text',
  questionKey: 'II.1',
  text: 'Private prompt',
  maxUnits: 1000,
  criteria: [
    {
      id: 'real-id',
      description: 'Correct reasoning',
      maxUnits: 1000,
      levels: [
        { pointsUnits: 0, description: 'No reason' },
        { pointsUnits: 1000, description: 'Correct' },
      ],
    },
  ],
};

it('builds one text-only payload without internal identifiers or source fields', () => {
  expect(
    textPayload(question, { text: 'Answer', studentId: 4, image: 'private' }),
  ).toEqual({
    answer: 'Answer',
    criteria: [
      {
        id: 'c1',
        description:
          'Câu hỏi: Private prompt\nCorrect reasoning\n0: No reason\n1000: Correct',
        allowedUnits: [0, 1000],
      },
    ],
  });
  expect(
    textPayload({ ...question, kind: 'rubric_drawing' }, { text: 'Answer' }),
  ).toBeNull();
});
it('rejects an unapproved award and restores evidence only from the local manifest', () => {
  const input = textPayload(question, { text: 'Answer' })!;
  const row = {
    id: 'c1',
    earnedUnits: 1000,
    reason: 'Correct',
    evidenceRegionIds: ['fake'],
  };
  expect(
    validateExternalGrades({ criteria: [row] }, input, question, ['local']),
  ).toEqual([
    {
      criterionId: 'real-id',
      pointsUnits: 1000,
      reason: 'Correct',
      evidenceRegionIds: ['local'],
    },
  ]);
  expect(() =>
    validateExternalGrades(
      { criteria: [{ ...row, earnedUnits: 500 }] },
      input,
      question,
      ['local'],
    ),
  ).toThrow('external_grading_response_invalid');
});

it('detects roster names without accents and codes inside the actual outgoing fields', () => {
  const roster = [
    { displayNameSnapshot: 'Trần Văn Nam', studentCodeSnapshot: 'HSCN1234' },
  ];
  expect(
    containsRosterIdentity(
      textPayload(question, { text: 'Tran  Van-Nam viết.' })!,
      roster,
    ),
  ).toBe(true);
  expect(
    containsRosterIdentity(
      textPayload(question, { text: 'Mã HSCN1234.' })!,
      roster,
    ),
  ).toBe(true);
  expect(
    containsRosterIdentity(
      textPayload(question, { text: 'Đáp án đã chọn.' })!,
      roster,
    ),
  ).toBe(false);
});

it('does not open a connection when the gateway policy is disabled', async () => {
  const env = jest.replaceProperty(process, 'env', {
    ...process.env,
    ASSESSMENT_EXTERNAL_GRADING_ENABLED: 'false',
  });
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  try {
    await expect(
      requestExternalTextGrade(
        textPayload(question, { text: 'Answer' })!,
        'pilot-v1',
      ),
    ).rejects.toThrow('external_grading_unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    fetchMock.mockRestore();
    env.restore();
  }
});
