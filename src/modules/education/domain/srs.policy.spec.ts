import { calculateSrsReview } from './srs.policy';

describe('calculateSrsReview', () => {
  it('moves a first correct answer to a one day interval', () => {
    expect(
      calculateSrsReview({
        quality: 4,
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
      }),
    ).toMatchObject({
      interval: 1,
      repetitions: 1,
      status: 'learning',
    });
  });

  it('resets repetitions for an incorrect answer', () => {
    expect(
      calculateSrsReview({
        quality: 2,
        easeFactor: 2.5,
        interval: 6,
        repetitions: 3,
      }),
    ).toMatchObject({
      interval: 1,
      repetitions: 0,
      status: 'new',
    });
  });

  it('never lets ease factor fall below 1.3', () => {
    expect(
      calculateSrsReview({
        quality: 0,
        easeFactor: 1.31,
        interval: 6,
        repetitions: 3,
      }).easeFactor,
    ).toBe(1.3);
  });
});
