import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hash } from './assessment.policy';

// These vectors are what the Python worker compares against. Regenerate with
// `node scripts/emit-hash-vectors.mjs`; this spec fails if the committed
// vectors drift from the real `hash()` implementation above. The generator
// duplicates the algorithm, so only this check ties the fixtures to the code.
const vectors = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../assessment-worker/tests/fixtures/hash-vectors.json',
    ),
    'utf8',
  ),
) as { hash: { input: unknown; expected: string }[] };

describe('canonical hash vectors', () => {
  it('match the Node hash for every fixture', () => {
    expect(vectors.hash.length).toBeGreaterThan(0);
    for (const { input, expected } of vectors.hash)
      expect(hash(input)).toBe(expected);
  });
});
