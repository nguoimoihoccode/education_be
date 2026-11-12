import { retryDecision, workerStages } from './engine';
describe('durable assessment retry policy', () => {
  it('never retries stale work or a lost lease', () => {
    expect(retryDecision('job_stale', 1).state).toBe('cancelled');
    expect(retryDecision('job_lease_lost', 1).state).toBe('cancelled');
  });
  it('pauses for budget/config errors and bounds transient retries', () => {
    expect(retryDecision('daily_budget_exceeded', 1).state).toBe('paused');
    expect(retryDecision('provider_http_503', 1).state).toBe('retry_wait');
    expect(retryDecision('provider_http_503', 3).state).toBe('failed');
  });
});
describe('stage ownership split', () => {
  const original = process.env.ASSESSMENT_WORKER_STAGES;
  afterEach(() => {
    if (original === undefined) delete process.env.ASSESSMENT_WORKER_STAGES;
    else process.env.ASSESSMENT_WORKER_STAGES = original;
  });
  it('leaves the queue untouched when nothing is configured', () => {
    delete process.env.ASSESSMENT_WORKER_STAGES;
    expect(workerStages()).toBeNull();
    process.env.ASSESSMENT_WORKER_STAGES = '  ';
    expect(workerStages()).toBeNull();
  });
  it('accepts a comma or space separated list', () => {
    process.env.ASSESSMENT_WORKER_STAGES = 'grade, export';
    expect(workerStages()).toEqual(['grade', 'export']);
    process.env.ASSESSMENT_WORKER_STAGES = 'seal extract';
    expect(workerStages()).toEqual(['seal', 'extract']);
  });
  it('refuses a stage the processor cannot run', () => {
    process.env.ASSESSMENT_WORKER_STAGES = 'seal,purge';
    expect(() => workerStages()).toThrow('unsupported_worker_stages:purge');
  });
});
