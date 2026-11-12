"""Released-text grading, ported from ``runtime/external-text-worker.ts``.

The permission check is deliberately one long predicate: every fact it reads —
fresh input revision, unchanged exam version and answer revision, running
lease, no active publication, a release event whose hash still matches, no
roster identity in the payload — must still hold immediately before text is
sent. A cached response short-circuits the call, but only after the same check.
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from typing import Any, Mapping, Sequence

import asyncpg

from .canonical import stringify
from .db import write
from .domain.policy import hash as policy_hash
from .external_text import (
    TEXT_RELEASE_EVENT,
    TEXT_REVOKE_EVENT,
    contains_roster_identity,
    external_text_policy,
    request_external_text_grade,
    text_payload,
    text_payload_hash,
    validate_external_grades,
)
from .storage import AssessmentStorage

CALL_PURPOSE = "external_text_grading"

ASSESSMENT = """
SELECT id,archived_at,context_revision
  FROM school_assessments
 WHERE school_id=$1 AND id=$2
 FOR UPDATE
"""

SUBMISSION = """
SELECT id,deleted_at,identity_state,identity_revision,input_revision,exam_version_id,
       current_answer_revision_ids,current_review_revision_id
  FROM school_assessment_submissions
 WHERE school_id=$1 AND assessment_id=$2 AND id=$3
 FOR UPDATE
"""

JOB = """
SELECT state,lease_token,lease_until
  FROM school_assessment_jobs
 WHERE school_id=$1 AND assessment_id=$2 AND id=$3
 FOR UPDATE
"""

PUBLICATION = """
SELECT 1
  FROM school_assessment_publications
 WHERE school_id=$1 AND submission_id=$2 AND state='active'
 LIMIT 1
"""

RELEASE = """
SELECT id,event_type,after_ref
  FROM school_assessment_review_events
 WHERE school_id=$1 AND assessment_id=$2 AND id=$3 AND submission_id=$4
   AND event_type=$5
"""

REVOKED = """
SELECT 1
  FROM school_assessment_review_events
 WHERE school_id=$1 AND assessment_id=$2 AND submission_id=$3
   AND event_type=$4
   AND after_ref @> CAST($5::text AS jsonb)
 LIMIT 1
"""

ROSTER = """
SELECT display_name_snapshot,student_code_snapshot
  FROM school_assessment_roster
 WHERE school_id=$1 AND assessment_id=$2
"""

PREVIOUS = """
SELECT state,response_object_key
  FROM school_assessment_provider_calls
 WHERE school_id=$1 AND purpose=$2 AND request_hash=$3
 ORDER BY created_at DESC, id DESC
 LIMIT 1
"""

COUNTS = """
SELECT COUNT(*) FILTER (WHERE p.created_at >= now() - interval '24 hours') AS daily,
       COUNT(*) FILTER (
         WHERE j.submission_id=$2 AND j.data->>'inputRevision'=$3
       ) AS "submissionCalls"
  FROM school_assessment_provider_calls p
  JOIN school_assessment_jobs j
    ON p.job_id=j.id AND p.school_id=j.school_id
 WHERE p.school_id=$1 AND p.purpose=$4 AND p.state<>'not_sent'
"""

ATTEMPTS = """
SELECT count(*)
  FROM school_assessment_provider_calls
 WHERE school_id=$1 AND job_id=$2
"""


def _max_calls() -> int:
    raw = (
        os.environ.get("ASSESSMENT_EXTERNAL_GRADING_MAX_CALLS_PER_SUBMISSION")
        or "6"
    )
    try:
        value = float(raw)
    except ValueError:
        return 6
    if not value.is_integer() or value <= 0:
        return 6
    return min(int(value), 12)


async def _has_permission(
    connection: asyncpg.Connection,
    job: Mapping[str, Any],
    answer: Mapping[str, Any],
    question: Mapping[str, Any],
    payload: Mapping[str, Any],
    payload_hash: str,
    policy: str,
    release_id: str,
) -> bool:
    scope = (job["school_id"], job["assessment_id"])
    assessment = await connection.fetchrow(ASSESSMENT, *scope)
    if (
        assessment is None
        or assessment["archived_at"] is not None
        or external_text_policy(assessment["id"]) != policy
    ):
        return False
    submission = await connection.fetchrow(
        SUBMISSION, scope[0], scope[1], job["submission_id"]
    )
    running = await connection.fetchrow(
        JOB, scope[0], scope[1], job["id"]
    )
    if (
        submission is None
        or submission["deleted_at"] is not None
        or submission["identity_state"] != "confirmed"
        or submission["input_revision"] != (job["data"] or {}).get("inputRevision")
        or submission["exam_version_id"] != answer["exam_version_id"]
        or (submission["current_answer_revision_ids"] or {}).get(
            question["questionKey"]
        )
        != answer["id"]
        or running is None
        or running["state"] != "running"
        or running["lease_token"] != job["lease_token"]
        or running["lease_until"] is None
        or running["lease_until"] <= datetime.now(timezone.utc)
    ):
        return False
    if (
        await connection.fetchrow(
            PUBLICATION, scope[0], submission["id"]
        )
        is not None
    ):
        return False
    release = await connection.fetchrow(
        RELEASE, scope[0], scope[1], release_id, submission["id"],
        TEXT_RELEASE_EVENT,
    )
    if (
        await connection.fetchrow(
            REVOKED,
            scope[0],
            scope[1],
            submission["id"],
            TEXT_REVOKE_EVENT,
            json.dumps({"releaseIds": [release_id]}),
        )
        is not None
    ):
        return False
    approved = (release or {}).get("after_ref") or {}
    if (
        release is None
        or release["id"] != release_id
        or release["event_type"] != TEXT_RELEASE_EVENT
        or approved.get("policy") != policy
        or approved.get("inputRevision") != submission["input_revision"]
        or approved.get("identityRevision") != submission["identityRevision"]
        or approved.get("contextRevision") != assessment["context_revision"]
        or approved.get("reviewRevisionId")
        != submission["current_review_revision_id"]
        or approved.get("examVersionId") != submission["exam_version_id"]
        or (approved.get("hashes") or {}).get(question["questionKey"])
        != payload_hash
    ):
        return False
    roster = await connection.fetch(
        ROSTER, scope[0], scope[1]
    )
    return not contains_roster_identity(payload, roster)


async def grade_released_text(
    pool: asyncpg.Pool,
    storage: AssessmentStorage,
    job: Mapping[str, Any],
    answer: Mapping[str, Any],
    question: Mapping[str, Any],
) -> list[dict[str, Any]] | None:
    release_id = (job["data"] or {}).get("externalReleaseId")
    policy = external_text_policy(job["assessment_id"])
    payload = (
        text_payload(question, answer["content"])
        if policy and release_id
        else None
    )
    if (
        not policy
        or not release_id
        or payload is None
        or not job["submission_id"]
        or not answer["source_region_ids"]
    ):
        return None
    payload_hash = text_payload_hash(payload)
    request_hash = policy_hash(
        {
            "policy": policy,
            "answerRevisionId": answer["id"],
            "payloadHash": payload_hash,
        }
    )

    async with pool.acquire() as connection:
        async with connection.transaction():
            if not await _has_permission(
                connection, job, answer, question, payload, payload_hash,
                policy, release_id,
            ):
                reservation = None
            else:
                await connection.execute(
                    "SELECT pg_advisory_xact_lock(hashtext($1))",
                    f"assessment-external:{job['school_id']}",
                )
                previous = await connection.fetchrow(
                    PREVIOUS, job["school_id"], CALL_PURPOSE, request_hash
                )
                if previous is not None and previous["state"] != "not_sent":
                    reservation = (
                        {"cached": previous["response_object_key"]}
                        if previous["state"] == "succeeded"
                        and previous["response_object_key"]
                        else None
                    )
                else:
                    reservation = await _reserve(
                        connection, job, policy, request_hash
                    )

    if reservation is None:
        return None
    regions = list(answer["source_region_ids"])
    if reservation.get("cached"):
        try:
            raw = json.loads(
                (await storage.read(reservation["cached"], 65536)).decode()
            )
            return validate_external_grades(raw, payload, question, regions)
        except Exception:
            return None
    call_id = reservation.get("callId")
    if not call_id:
        return None
    update = {"id": call_id, "schoolId": job["school_id"]}
    try:
        async with pool.acquire() as connection:
            async with connection.transaction():
                if await _has_permission(
                    connection, job, answer, question, payload, payload_hash,
                    policy, release_id,
                ):
                    # Start the request before the permission lock is released;
                    # await it outside the transaction so other papers proceed.
                    started = asyncio.ensure_future(_guarded_request(payload, policy))
                else:
                    started = None
        if started is None:
            async with pool.acquire() as connection:
                await write.update(
                    connection,
                    "school_assessment_provider_calls",
                    {
                        "state": "not_sent",
                        "errorCode": "external_grading_revoked",
                    },
                    update,
                )
            return None
        raw = await started
        criteria = validate_external_grades(raw, payload, question, regions)
        response_key = (
            f"assessment/{job['school_id']}/{job['assessment_id']}"
            f"/provider/{call_id}.json"
        )
        # Persist only the gateway's verified criterion fields, never the
        # provider envelope.
        checked = {
            "criteria": [
                {
                    "id": payload["criteria"][index]["id"],
                    "earnedUnits": grade["pointsUnits"],
                    "reason": grade["reason"],
                }
                for index, grade in enumerate(criteria)
            ]
        }
        await storage.put(
            response_key, stringify(checked).encode(), "application/json"
        )
        async with pool.acquire() as connection:
            await write.update(
                connection,
                "school_assessment_provider_calls",
                {"state": "succeeded", "responseObjectKey": response_key},
                update,
            )
        return criteria
    except Exception:
        # An uncertain delivery is counted and never retried automatically for
        # the same answer.
        async with pool.acquire() as connection:
            await write.update(
                connection,
                "school_assessment_provider_calls",
                {
                    "state": "unknown",
                    "errorCode": "external_grading_unavailable",
                },
                update,
            )
        return None


async def _guarded_request(payload: Mapping[str, Any], policy: str) -> Any:
    try:
        return await request_external_text_grade(payload, policy)
    except Exception:
        return None


async def _reserve(
    connection: asyncpg.Connection,
    job: Mapping[str, Any],
    policy: str,
    request_hash: str,
) -> dict[str, Any] | None:
    counts = await connection.fetchrow(
        COUNTS,
        job["school_id"],
        job["submission_id"],
        str((job["data"] or {}).get("inputRevision")),
        CALL_PURPOSE,
    )
    if int(counts["daily"]) >= 120 or int(counts["submissionCalls"]) >= _max_calls():
        return None
    attempts = await connection.fetchval(
        ATTEMPTS, job["school_id"], job["id"]
    )
    rows = await write.insert(
        connection,
        "school_assessment_provider_calls",
        {
            "schoolId": job["school_id"],
            "jobId": job["id"],
            "attemptNumber": int(attempts) + 1,
            "profileHash": policy_hash(policy),
            "provider": "external_gateway",
            "modelRequested": "gateway_policy",
            "purpose": CALL_PURPOSE,
            "requestHash": request_hash,
            "state": "reserved",
            "reservedCostMicros": 0,
        },
        returning=("id",),
    )
    return {"callId": rows[0]["id"]}
