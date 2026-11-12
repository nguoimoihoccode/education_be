import { validatePageRead, withinPrimary } from './extraction';
describe('assessment source grounding', () => {
  it('rejects evidence from a background sheet', () => {
    expect(
      withinPrimary(
        [
          [0.9, 0.9],
          [1, 0.9],
          [1, 1],
        ],
        [
          [0, 0],
          [0.7, 0],
          [0.7, 0.7],
          [0, 0.7],
        ],
      ),
    ).toBe(false);
  });
  it('rejects invented roles and malformed coordinate bounds', () => {
    expect(() =>
      validatePageRead({
        pageRole: 'mixed',
        primaryPolygon: [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        examCode: '102',
        questionFragments: [],
        regions: [
          {
            regionKey: 'x',
            role: 'system',
            polygon: [
              [0, 0],
              [1, 0],
              [1, 1],
            ],
          },
        ],
      }),
    ).toThrow('reader_schema_invalid');
  });
});
