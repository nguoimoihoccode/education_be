import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRouting, reserveCostMicros, selectProfile } from './routing';
const fixture = () =>
  JSON.parse(
    readFileSync(
      resolve('docs/assessment/contracts/agent-routing.example.json'),
      'utf8',
    ),
  );
describe('assessment runtime admission', () => {
  it('refuses a design-only config for paid execution', () => {
    expect(() => parseRouting(fixture(), '2026-11-04')).toThrow(
      'routing_not_pilot',
    );
  });
  it('refuses an unbenchmarked active profile', () => {
    const cfg = fixture();
    cfg.deploymentState = 'pilot';
    expect(() => parseRouting(cfg, '2026-11-04')).toThrow('profile_not_ready');
  });
  it('pins model and price expiry before admitting a call', () => {
    const cfg = fixture();
    cfg.deploymentState = 'pilot';
    Object.values(cfg.profiles).forEach((p: any) => (p.qualityGate = 'passed'));
    const parsed = parseRouting(cfg, '2026-11-04');
    expect(() =>
      selectProfile(parsed, 'image_reader', true, '2026-12-01'),
    ).toThrow('profile_expired_or_unavailable');
    expect(() =>
      selectProfile(parsed, 'text_grader', true, '2026-11-04'),
    ).toThrow('vision_required');
  });
  it('reserves worst-case output with integer ceiling', () => {
    expect(reserveCostMicros(1, 1, 300000, 2500000)).toBe(3);
    expect(() => reserveCostMicros(-1, 2, 1, 1)).toThrow();
  });
});

it('refuses a schema-valid provider/dialect mismatch before allowlist admission', () => {
  const cfg = fixture();
  cfg.deploymentState = 'pilot';
  Object.values(cfg.profiles).forEach((p: any) => (p.qualityGate = 'passed'));
  cfg.profiles[Object.keys(cfg.profiles)[0]].apiDialect =
    'openai_chat_completions';
  expect(() => parseRouting(cfg, '2026-11-04')).toThrow(
    'provider_dialect_invalid',
  );
});
