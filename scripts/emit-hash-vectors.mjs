// Regenerates assessment-worker/tests/fixtures/hash-vectors.json.
// The hash/digest bodies below are copies of the Node originals
// (domain/assessment.policy.ts:15-29 and runtime/provider.ts:87-88);
// domain/canonical-vectors.spec.ts fails if the committed vectors drift from
// the real hash(). The digest copy has no such check yet.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '..', 'assessment-worker', 'tests', 'fixtures');

const stable = (v) =>
  Array.isArray(v)
    ? v.map(stable)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, stable(v[k])]),
        )
      : v;
const hash = (v) =>
  createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');
const digest = (v) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');

const inputs = JSON.parse(readFileSync(join(fixtures, 'hash-inputs.json'), 'utf8'));
const vectors = {
  hash: inputs.hash.map((input) => ({ input, expected: hash(input) })),
  digest: inputs.digest.map((input) => ({ input, expected: digest(input) })),
};
writeFileSync(join(fixtures, 'hash-vectors.json'), `${JSON.stringify(vectors, null, 2)}\n`);
console.log(`wrote ${vectors.hash.length} hash and ${vectors.digest.length} digest vectors`);
