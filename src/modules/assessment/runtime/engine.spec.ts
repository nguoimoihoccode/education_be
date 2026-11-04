import { retryDecision } from './engine';
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
