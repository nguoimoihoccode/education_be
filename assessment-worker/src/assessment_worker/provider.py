"""Model gateway, ported from ``runtime/provider.ts``.

Three things here are money or correctness, not convenience:

* ``digest`` keeps dict insertion order — ``request_hash`` is the cache key the
  API and this worker must agree on, so the objects below are written with the
  exact key order of the Node literals;
* the admission transaction takes the tenant budget advisory lock before the
  job row, the same lock order as the Node worker, so the two cannot deadlock;
* a pre-provider refusal is recorded ``not_sent`` with zero cost, while an
  unknown outcome stays ``unknown`` and keeps the reservation.
"""

from __future__ import annotations

import base64
import json
import time
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

import asyncpg

from .canonical import digest, stringify
from .db import write
from .db.jobs import JobError
from .inference import (
    InferenceConfig,
    InferenceRejected,
    inference_config,
    run_inference,
    run_local_inference,
)
from .routing import SAFE_INTEGER, reserve_cost_micros, select_profile
from .storage import AssessmentStorage

CACHE = """
SELECT response_object_key
  FROM school_assessment_provider_calls
 WHERE job_id=$1 AND request_hash=$2 AND state='succeeded'
 ORDER BY created_at DESC
 LIMIT 1
"""

JOB_LOCK = """
SELECT lease_token,state,lease_until
  FROM school_assessment_jobs
 WHERE id=$1 AND school_id=$2
 FOR UPDATE
"""

# provider.ts:161 — budget windows follow the school's local day, not UTC.
DAILY = """
SELECT COALESCE(SUM(COALESCE(actual_cost_micros,reserved_cost_micros)),0) AS total
  FROM school_assessment_provider_calls
 WHERE school_id=$1
   AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
"""

SCOPE = """
SELECT count(*) AS calls,
       COALESCE(SUM(COALESCE(p.actual_cost_micros,p.reserved_cost_micros)),0) AS total
  FROM school_assessment_provider_calls p
  JOIN school_assessment_jobs j ON j.id=p.job_id AND j.school_id=p.school_id
 WHERE j.school_id=$1
   AND j.submission_id IS NOT DISTINCT FROM $2
   AND j.assessment_id=$3
   AND j.data->>'inputRevision' IS NOT DISTINCT FROM $4
   AND p.state <> 'not_sent'
"""

ATTEMPTS = """
SELECT count(*) FROM school_assessment_provider_calls WHERE job_id=$1
"""


def _valid_usage(value: Any) -> int | None:
    """``Number.isSafeInteger(value) && value >= 0``."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if isinstance(value, float) and not value.is_integer():
        return None
    number = int(value)
    return number if 0 <= number <= SAFE_INTEGER else None


_MISSING = object()


def parse_provider_response(
    profile: Mapping[str, Any], raw: Any
) -> dict[str, Any]:
    text: str | None
    input_tokens: int | None = None
    output_tokens: int | None = None
    model_reported: str | None = None
    body = raw if isinstance(raw, dict) else {}
    if profile["apiDialect"] == "google_generate_content":
        candidates = body.get("candidates") or []
        candidate = candidates[0] if candidates else None
        if not candidate or candidate.get("finishReason") != "STOP":
            raise JobError("provider_output_incomplete")
        parts = (candidate.get("content") or {}).get("parts") or []
        text = "".join(
            part.get("text") or ""
            for part in parts
            if not part.get("thought")
        )
        usage = body.get("usageMetadata") or {}
        input_tokens = _valid_usage(usage.get("promptTokenCount"))
        completion = _valid_usage(usage.get("candidatesTokenCount"))
        # ``undefined`` means "no thinking" (0); an explicit JSON null is a
        # malformed usage block and must not count as zero.
        reported = usage.get("thoughtsTokenCount", _MISSING)
        thoughts = 0 if reported is _MISSING else _valid_usage(reported)
        output_tokens = (
            _valid_usage(completion + thoughts)
            if completion is not None and thoughts is not None
            else None
        )
        model_reported = body.get("modelVersion") or None
    else:
        choices = body.get("choices") or []
        choice = choices[0] if choices else None
        message = (choice or {}).get("message") or {}
        if not choice or choice.get("finish_reason") != "stop" or message.get(
            "refusal"
        ):
            raise JobError("provider_output_incomplete")
        text = message.get("content")
        usage = body.get("usage") or {}
        input_tokens = _valid_usage(usage.get("prompt_tokens"))
        output_tokens = _valid_usage(usage.get("completion_tokens"))
        model_reported = body.get("model") or None
    if not text or len(text) > 200000:
        raise JobError("provider_json_invalid")
    try:
        output = json.loads(text)
    except ValueError:
        raise JobError("provider_json_invalid") from None
    return {
        "output": output,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "modelReported": model_reported,
        "usageComplete": input_tokens is not None and output_tokens is not None,
    }


class AssessmentModels:
    def __init__(
        self,
        pool: asyncpg.Pool,
        storage: AssessmentStorage,
        cfg: Mapping[str, Any],
        mode: str = "local",
    ) -> None:
        self.pool = pool
        self.storage = storage
        self.cfg = cfg
        self.mode = mode

    async def json(
        self,
        job: Mapping[str, Any],
        role: str,
        instruction: str,
        input: Any,
        images: Sequence[Mapping[str, Any]] = (),
    ) -> Any:
        if self.mode == "local":
            return await run_local_inference(instruction, input, images)
        _, profile = select_profile(self.cfg, role, len(images) > 0)
        config: InferenceConfig = inference_config()
        # Conservative text bound (bytes >= tokens) plus an image allowance;
        # split page jobs rather than silently truncating.
        estimated_input = len((instruction + stringify(input)).encode()) + (
            len(images) * 8192
        )
        if estimated_input > profile["maxInputTokens"]:
            raise JobError("provider_input_limit")
        profile_hash = digest(profile)
        request_hash = digest(
            {
                "role": role,
                "instruction": instruction,
                "input": input,
                "images": [
                    digest(
                        base64.b64encode(image["bytes"]).decode("ascii")
                    )
                    for image in images
                ],
                "profileHash": profile_hash,
            }
        )
        async with self.pool.acquire() as connection:
            prior = await connection.fetchrow(CACHE, job["id"], request_hash)
        if prior is not None and prior["response_object_key"]:
            payload = await self.storage.read(
                prior["response_object_key"], 2 * 1024 * 1024
            )
            return json.loads(payload.decode("utf-8"))["output"]
        reservation = reserve_cost_micros(
            profile["maxInputTokens"],
            profile["maxOutputTokens"],
            profile["pricing"]["inputMicrosPerMillion"],
            profile["pricing"]["outputMicrosPerMillion"],
        )
        call_id = await self._reserve(
            job, role, profile, profile_hash, request_hash, reservation
        )
        start = time.monotonic()
        try:
            raw = await run_inference(
                config, profile, instruction, input, images
            )
            result = parse_provider_response(profile, raw)
            response_key = (
                f"assessment/{job['school_id']}/{job['assessment_id']}"
                f"/provider/{call_id}.json"
            )
            await self.storage.put(
                response_key, stringify(result).encode(), "application/json"
            )
            complete = result["usageComplete"]
            update: dict[str, Any] = {
                "state": "succeeded",
                "responseObjectKey": response_key,
                "modelReported": result["modelReported"],
                "inputUsage": {}
                if result["inputTokens"] is None
                else {"tokens": result["inputTokens"]},
                "outputUsage": {}
                if result["outputTokens"] is None
                else {"tokens": result["outputTokens"]},
                "actualCostMicros": reserve_cost_micros(
                    result["inputTokens"],
                    result["outputTokens"],
                    profile["pricing"]["inputMicrosPerMillion"],
                    profile["pricing"]["outputMicrosPerMillion"],
                )
                if complete
                else None,
                "latencyMs": _elapsed(start),
            }
            async with self.pool.acquire() as connection:
                await write.update(
                    connection,
                    "school_assessment_provider_calls",
                    update,
                    {"id": call_id},
                )
            return result["output"]
        except Exception as error:
            not_sent = isinstance(error, InferenceRejected)
            failure: dict[str, Any] = {
                "state": "not_sent" if not_sent else "unknown",
                "errorCode": str(error)[:100],
                "latencyMs": _elapsed(start),
            }
            if not_sent:
                failure["actualCostMicros"] = 0
            async with self.pool.acquire() as connection:
                await write.update(
                    connection,
                    "school_assessment_provider_calls",
                    failure,
                    {"id": call_id},
                )
            raise

    async def _reserve(
        self,
        job: Mapping[str, Any],
        role: str,
        profile: Mapping[str, Any],
        profile_hash: str,
        request_hash: str,
        reservation: int,
    ) -> Any:
        policy = self.cfg["policy"]
        async with self.pool.acquire() as connection:
            async with connection.transaction():
                # A tenant lock serializes every worker's reservation, including
                # across different jobs.
                await connection.execute(
                    "SELECT pg_advisory_xact_lock(hashtext($1))",
                    f"assessment-budget:{job['school_id']}",
                )
                current = await connection.fetchrow(
                    JOB_LOCK, job["id"], job["school_id"]
                )
                if (
                    current is None
                    or current["lease_token"] != job["lease_token"]
                    or current["state"] != "running"
                    or current["lease_until"] is None
                    or current["lease_until"] < datetime.now(timezone.utc)
                ):
                    raise JobError("job_lease_lost")
                daily = await connection.fetchrow(DAILY, job["school_id"])
                if int(daily["total"]) + reservation > policy[
                    "dailyCostLimitMicros"
                ]:
                    raise JobError("daily_budget_exceeded")
                input_revision = str((job["data"] or {}).get("inputRevision") or 1)
                scope = await connection.fetchrow(
                    SCOPE,
                    job["school_id"],
                    job["submission_id"],
                    job["assessment_id"],
                    input_revision,
                )
                cap = (
                    policy["maxProviderCallsPerSubmissionRevision"]
                    if job["submission_id"]
                    else policy["maxProviderCallsPerTemplate"]
                )
                if (
                    int(scope["calls"]) >= cap
                    or int(scope["total"]) + reservation
                    > policy["maxCostMicrosPerSubmissionRevision"]
                ):
                    raise JobError("submission_budget_exceeded")
                attempts = await connection.fetchval(ATTEMPTS, job["id"])
                rows = await write.insert(
                    connection,
                    "school_assessment_provider_calls",
                    {
                        "schoolId": job["school_id"],
                        "jobId": job["id"],
                        "attemptNumber": int(attempts) + 1,
                        "profileHash": profile_hash,
                        "provider": profile["provider"],
                        "modelRequested": profile["model"],
                        "purpose": role,
                        "requestHash": request_hash,
                        "state": "reserved",
                        "reservedCostMicros": reservation,
                        "inputUsage": {},
                        "outputUsage": {},
                    },
                    returning=("id",),
                )
                return rows[0]["id"]


def _elapsed(start: float) -> int:
    return int((time.monotonic() - start) * 1000)
