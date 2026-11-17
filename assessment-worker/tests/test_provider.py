"""Parity tests for ``provider.py`` against ``runtime/provider.spec.ts``.

The cases are the same ones the Node suite asserts, because they encode
billing and safety rules rather than implementation details: truncated output
must never be scored, an incomplete usage block must keep the reservation, and
a pre-provider refusal costs zero.
"""

from __future__ import annotations

import json
import math
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import pytest

from assessment_worker import provider as provider_module
from assessment_worker.db.jobs import JobError, retry_decision
from assessment_worker.inference import (
    InferenceConfig,
    InferenceRejected,
    inference_config,
    read_bounded_response,
    run_inference,
)
from assessment_worker.provider import AssessmentModels, parse_provider_response

PROFILE = {
    "provider": "google",
    "model": "gemini-2.5-flash",
    "apiDialect": "google_generate_content",
    "reasoningPolicy": "disabled",
    "maxOutputTokens": 4096,
}


def _google(text: str, usage: dict[str, Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {
        "candidates": [
            {"finishReason": "STOP", "content": {"parts": [{"text": text}]}}
        ]
    }
    if usage is not None:
        body["usageMetadata"] = usage
    return body


def test_truncated_output_is_rejected() -> None:
    with pytest.raises(JobError, match="provider_output_incomplete"):
        parse_provider_response(
            PROFILE,
            {
                "candidates": [
                    {
                        "finishReason": "MAX_TOKENS",
                        "content": {"parts": [{"text": "{}"}]},
                    }
                ]
            },
        )


def test_malformed_json_is_rejected_and_usage_is_preserved() -> None:
    with pytest.raises(JobError, match="provider_json_invalid"):
        parse_provider_response(PROFILE, _google("not json"))
    result = parse_provider_response(
        PROFILE,
        _google(
            '{"ok":true}',
            {"promptTokenCount": 10, "candidatesTokenCount": 2,
             "thoughtsTokenCount": 3},
        ),
    )
    assert result["outputTokens"] == 5
    assert result["usageComplete"] is True


def test_absent_thinking_tokens_count_as_zero() -> None:
    result = parse_provider_response(
        PROFILE, _google("{}", {"promptTokenCount": 10, "candidatesTokenCount": 2})
    )
    assert result["outputTokens"] == 2


@pytest.mark.parametrize("completion", [None, -1, math.nan, 1.5])
def test_incomplete_completion_usage_keeps_the_reservation(
    completion: Any,
) -> None:
    usage: dict[str, Any] = {"promptTokenCount": 10}
    if completion is not None:
        usage["candidatesTokenCount"] = completion
    result = parse_provider_response(PROFILE, _google("{}", usage))
    assert result["usageComplete"] is False
    assert result["outputTokens"] is None


def test_provider_dialect_mismatch_fails_before_any_http() -> None:
    config = InferenceConfig(
        url="http://assessment-inference:8000", token="x" * 32
    )
    with pytest.raises(JobError, match="provider_dialect_invalid"):
        import asyncio

        asyncio.run(
            run_inference(
                config,
                {**PROFILE, "apiDialect": "openai_chat_completions"},
                "",
                {},
                [],
            )
        )


class _Chunks:
    def __init__(self, chunks: list[bytes]) -> None:
        self._chunks = chunks

    async def aiter_bytes(self) -> AsyncIterator[bytes]:
        for chunk in self._chunks:
            yield chunk


def test_oversized_response_is_rejected() -> None:
    import asyncio

    with pytest.raises(JobError, match="provider_response_limit"):
        asyncio.run(read_bounded_response(_Chunks([b"x" * (2 * 1024 * 1024 + 1)])))


def test_utf8_decodes_across_chunk_boundaries() -> None:
    import asyncio

    data = '{"message":"đúng"}'.encode()
    assert (
        asyncio.run(read_bounded_response(_Chunks([data[:13], data[13:]])))
        == '{"message":"đúng"}'
    )


def test_public_inference_destination_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ASSESSMENT_INFERENCE_URL", "https://public.example")
    monkeypatch.setenv("ASSESSMENT_INFERENCE_TOKEN", "x" * 32)
    with pytest.raises(JobError, match="inference_configuration_required"):
        inference_config()


class _NullTransaction:
    async def __aenter__(self) -> None:
        return None

    async def __aexit__(self, *exc: object) -> bool:
        return False


class _FakeConnection:
    """Dispatches on SQL text so a mis-mapped query fails loudly."""

    def __init__(
        self, updates: list[dict[str, Any]], pilot_state: str | None = "active"
    ) -> None:
        self.updates = updates
        self.call_id = 0
        self.pilot_state = pilot_state

    async def fetchrow(self, sql: str, *args: Any) -> Any:
        if "response_object_key" in sql:
            return None
        if "FOR UPDATE" in sql:
            return {
                "lease_token": "lease",
                "state": "running",
                "lease_until": __import__("datetime").datetime(
                    2100, 1, 1, tzinfo=__import__("datetime").timezone.utc
                ),
            }
        if "AT TIME ZONE" in sql:
            return {"total": 0}
        if "p.state <> 'not_sent'" in sql:
            return {"calls": 0, "total": 0}
        raise AssertionError(sql)

    async def fetchval(self, sql: str, *args: Any) -> Any:
        if "school_assessment_pilot_scopes" in sql:
            assert "FOR SHARE" in sql
            return self.pilot_state
        assert "count(*)" in sql
        return 0

    async def execute(self, sql: str, *args: Any) -> None:
        if not sql.startswith("UPDATE school_assessment_provider_calls"):
            return
        head = sql.split(" SET ", 1)[1].split(" WHERE ", 1)[0]
        values: dict[str, Any] = {}
        for assignment in head.split(", "):
            column, _, source = assignment.partition("=")
            if source == "now()":
                continue
            values[column] = args[int(source[1:]) - 1]
        self.updates.append(values)

    async def fetch(self, sql: str, *args: Any) -> Any:
        assert "INSERT INTO school_assessment_provider_calls" in sql
        self.call_id += 1
        return [{"id": f"call-{self.call_id}"}]

    def transaction(self) -> _NullTransaction:
        return _NullTransaction()


class _FakePool:
    def __init__(self, connection: _FakeConnection) -> None:
        self.connection = connection

    def acquire(self) -> Any:
        @asynccontextmanager
        async def open_() -> AsyncIterator[_FakeConnection]:
            yield self.connection

        return open_()


class _FakeStorage:
    def __init__(self) -> None:
        self.objects: list[tuple[str, bytes, str]] = []

    async def put(self, key: str, data: bytes, mime: str) -> None:
        self.objects.append((key, data, mime))

    async def read(self, key: str, limit: int = 0) -> bytes:
        for stored, data, _ in self.objects:
            if stored == key:
                return data
        raise AssertionError(key)


CFG = {
    "profiles": {
        "test-google": {
            **PROFILE,
            "credentialRef": "ASSESSMENT_GOOGLE_API_KEY",
            "qualityGate": "passed",
            "capabilities": ["vision", "json"],
            "maxInputTokens": 8192,
            "allowThroughDate": None,
            "pricing": {
                "validThroughDate": "2099-01-01",
                "inputMicrosPerMillion": 1000000,
                "outputMicrosPerMillion": 1000000,
            },
        }
    },
    "agents": {"text_grader": {"mode": "model", "primaryProfileId": "test-google"}},
    "policy": {
        "tenantProviderAllowlist": ["google"],
        "dailyCostLimitMicros": 1000000,
        "maxProviderCallsPerSubmissionRevision": 24,
        "maxCostMicrosPerSubmissionRevision": 1000000,
        "maxProviderCallsPerTemplate": 24,
    },
}

JOB = {
    "id": "job",
    "school_id": "school",
    "assessment_id": "assessment",
    "submission_id": "submission",
    "lease_token": "lease",
    "data": {"inputRevision": 1},
}


@pytest.mark.asyncio
async def test_unknown_cost_when_paid_response_lacks_completion_usage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "ASSESSMENT_INFERENCE_URL", "http://assessment-inference:8000"
    )
    monkeypatch.setenv("ASSESSMENT_INFERENCE_TOKEN", "x" * 32)
    outcomes: list[Any] = [
        _google("{}", {"promptTokenCount": 10}),
        InferenceRejected("inference_busy"),
        JobError("provider_timeout"),
    ]

    async def fake_run_inference(*args: Any, **kwargs: Any) -> Any:
        outcome = outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    monkeypatch.setattr(provider_module, "run_inference", fake_run_inference)
    connection = _FakeConnection([])
    storage = _FakeStorage()
    models = AssessmentModels(
        _FakePool(connection), storage, CFG, "synthetic"  # type: ignore[arg-type]
    )

    assert await models.json(JOB, "text_grader", "", {}) == {}
    success = connection.updates[-1]
    assert success["state"] == "succeeded"
    assert success["actual_cost_micros"] is None
    assert success["output_usage"] == {}
    assert success["input_usage"] == {"tokens": 10}
    key = storage.objects[-1][0]
    assert key == "assessment/school/assessment/provider/call-1.json"
    assert json.loads(storage.objects[-1][1])["output"] == {}

    with pytest.raises(InferenceRejected, match="inference_busy"):
        await models.json(JOB, "text_grader", "", {})
    not_sent = connection.updates[-1]
    assert not_sent["state"] == "not_sent"
    assert not_sent["actual_cost_micros"] == 0

    with pytest.raises(JobError, match="provider_timeout"):
        await models.json(JOB, "text_grader", "", {})
    unknown = connection.updates[-1]
    assert unknown["state"] == "unknown"
    assert "actual_cost_micros" not in unknown


@pytest.mark.asyncio
async def test_successful_call_records_usage_and_cost(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "ASSESSMENT_INFERENCE_URL", "http://assessment-inference:8000"
    )
    monkeypatch.setenv("ASSESSMENT_INFERENCE_TOKEN", "x" * 32)

    async def fake_run_inference(*args: Any, **kwargs: Any) -> Any:
        return _google(
            '{"score":1}',
            {
                "promptTokenCount": 1000,
                "candidatesTokenCount": 500,
                "thoughtsTokenCount": 0,
            },
        )

    monkeypatch.setattr(provider_module, "run_inference", fake_run_inference)
    connection = _FakeConnection([])
    models = AssessmentModels(
        _FakePool(connection), _FakeStorage(), CFG, "synthetic"  # type: ignore[arg-type]
    )
    assert await models.json(JOB, "text_grader", "", {}) == {"score": 1}
    update = connection.updates[-1]
    # 1000 input + 500 output tokens at 1 micro per token.
    assert update["actual_cost_micros"] == 1500
    assert update["output_usage"] == {"tokens": 500}
    assert update["input_usage"] == {"tokens": 1000}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("state", "code"),
    [("paused", "pilot_paused"), ("closed", "pilot_closed"), (None, "pilot_closed")],
)
async def test_paused_or_closed_scope_reserves_nothing_and_calls_no_model(
    monkeypatch: pytest.MonkeyPatch, state: str | None, code: str
) -> None:
    monkeypatch.setenv(
        "ASSESSMENT_INFERENCE_URL", "http://assessment-inference:8000"
    )
    monkeypatch.setenv("ASSESSMENT_INFERENCE_TOKEN", "x" * 32)

    async def fake_run_inference(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError("a model was called outside an active pilot scope")

    monkeypatch.setattr(provider_module, "run_inference", fake_run_inference)
    connection = _FakeConnection([], pilot_state=state)
    models = AssessmentModels(
        _FakePool(connection), _FakeStorage(), CFG, "synthetic"  # type: ignore[arg-type]
    )
    with pytest.raises(JobError, match=code):
        await models.json(JOB, "text_grader", "", {})
    assert connection.call_id == 0
    assert retry_decision(code, 1).state == "paused"
