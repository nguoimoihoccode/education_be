"""Retry decisions must match ``retryDecision`` in engine.ts line for line."""

from __future__ import annotations

import pytest

from assessment_worker.db.jobs import JobError, error_code, retry_decision


@pytest.mark.parametrize(
    ("code", "attempt", "state", "delay"),
    [
        ("job_stale", 1, "cancelled", 0),
        ("job_lease_lost", 2, "cancelled", 0),
        ("budget_exceeded", 1, "paused", 0),
        ("credentials_missing", 1, "paused", 0),
        ("routing_snapshot_mismatch", 1, "paused", 0),
        ("profile_unknown", 1, "paused", 0),
        ("workspace_full", 1, "paused", 0),
        ("audit_seed_required", 1, "paused", 0),
        ("exam_code_conflict", 1, "paused", 0),
        ("exam_questions_not_found", 1, "paused", 0),
        ("provider_http_429", 1, "retry_wait", 2000),
        ("provider_http_503", 2, "retry_wait", 10000),
        ("inference_unavailable", 1, "retry_wait", 2000),
        ("inference_busy", 2, "retry_wait", 10000),
        ("provider_unavailable", 1, "retry_wait", 2000),
        ("fetch failed", 1, "retry_wait", 2000),
        ("request timeout", 2, "retry_wait", 10000),
        ("ECONNREFUSED", 1, "retry_wait", 2000),
        ("ETIMEDOUT", 1, "retry_wait", 2000),
        ("assets_not_ready", 1, "retry_wait", 2000),
        # Third attempt is the last one: retryable codes turn into failures.
        ("provider_http_503", 3, "failed", 0),
        ("timeout", 3, "failed", 0),
        # Not retryable at any attempt.
        ("provider_http_400", 1, "failed", 0),
        ("schema_invalid", 1, "failed", 0),
        ("job_failed", 1, "failed", 0),
    ],
)
def test_retry_decision_matches_node(code, attempt, state, delay):
    decision = retry_decision(code, attempt)
    assert (decision.state, decision.delay_ms) == (state, delay)


def test_error_code_uses_the_exception_message():
    assert error_code(JobError("routing_snapshot_mismatch")) == (
        "routing_snapshot_mismatch"
    )
    assert error_code(RuntimeError("")) == "job_failed"
