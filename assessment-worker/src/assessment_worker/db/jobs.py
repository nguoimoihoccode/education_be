"""Job lifecycle, ported from ``src/modules/assessment/runtime/engine.ts``.

The statements keep the Node text so the two workers can be diffed while they
share ``school_assessment_jobs``. Two deliberate differences:

* the claim carries a stage filter, so a stage can be moved to this worker
  without the Node worker racing it;
* the lease length is a parameter instead of a literal ``180 seconds``.

PostgreSQL is the queue. The Node side polls the same table every 3 seconds and
also hands jobs to BullMQ; Python claims rows directly, including rows left in
``dispatched`` by that dispatcher.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any, Sequence

import asyncpg

MAX_ATTEMPTS = 3
LEASE_SECONDS = 180
HEARTBEAT_SECONDS = 30

# engine.ts:21-41 — same codes, same order, same case sensitivity.
_CANCELLED = frozenset({"job_stale", "job_lease_lost"})
_PAUSED = re.compile(
    r"budget|credentials|routing|profile_|workspace_|audit_seed|"
    r"exam_code_conflict|exam_questions_not_found"
)
_RETRYABLE = re.compile(
    r"provider_http_(429|5\d\d)|inference_(unavailable|busy)|"
    r"provider_unavailable|fetch failed|timeout|ECONN|ETIMEDOUT|assets_not_ready"
)

CLAIM = """
UPDATE school_assessment_jobs
   SET state='running',lease_token=$2,lease_owner=$3,
       lease_until=now()+($4::int*interval '1 second'),
       fencing_token=fencing_token+1,attempt_count=attempt_count+1
 WHERE id=(
   SELECT id FROM school_assessment_jobs
    WHERE execution_target='vps_colocated'
      AND stage=ANY($1::text[])
      AND attempt_count<3
      AND (state='dispatched'
           OR (state IN ('pending','retry_wait','running')
               AND next_attempt_at<=now()))
      AND (state<>'running' OR lease_until<now())
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED)
RETURNING id,assessment_id,stage,school_id,submission_id,data,created_at,
          routing_policy_hash,routing_version,attempt_count,lease_token,
          result_ref
"""

HEARTBEAT = """
UPDATE school_assessment_jobs
   SET lease_until=now()+($3::int*interval '1 second')
 WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now()
"""

SUCCEED = """
UPDATE school_assessment_jobs
   SET state='succeeded',lease_token=NULL,lease_owner=NULL,lease_until=NULL
 WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>now()
"""

FAIL = """
UPDATE school_assessment_jobs
   SET state=$3,last_error_code=$4,
       next_attempt_at=now()+($5::int*interval '1 millisecond'),
       lease_token=NULL,lease_owner=NULL,lease_until=NULL
 WHERE id=$1 AND lease_token=$2 AND state='running'
RETURNING id
"""

SUBMISSION_STATE = """
UPDATE school_assessment_submissions
   SET processing_state=$4,updated_at=now()
 WHERE id=$1 AND school_id=$2 AND input_revision=$3
"""

# engine.ts:136 — a job that expired its last lease while running is failed
# without another attempt, otherwise the attempt counter never ends.
REAP_ATTEMPT_LIMIT = """
UPDATE school_assessment_jobs
   SET state='failed',last_error_code='attempt_limit',lease_token=NULL,
       lease_owner=NULL,lease_until=NULL
 WHERE state='running' AND lease_until<now() AND attempt_count>=3
"""


class JobError(RuntimeError):
    """Raised by processors; the message is the retry-decision code."""


@dataclass(frozen=True)
class RetryDecision:
    state: str
    delay_ms: int


def retry_decision(code: str, attempt: int) -> RetryDecision:
    if code in _CANCELLED:
        return RetryDecision("cancelled", 0)
    if _PAUSED.search(code):
        return RetryDecision("paused", 0)
    if attempt < MAX_ATTEMPTS and _RETRYABLE.search(code):
        return RetryDecision("retry_wait", 2000 if attempt == 1 else 10000)
    return RetryDecision("failed", 0)


def error_code(error: BaseException) -> str:
    return str(error) or "job_failed"


def _updated(command_tag: str) -> int:
    return int(command_tag.rsplit(" ", 1)[1])


async def claim_next(
    pool: asyncpg.Pool,
    *,
    owner: str,
    stages: Sequence[str],
    lease_seconds: int = LEASE_SECONDS,
) -> asyncpg.Record | None:
    """Claim at most one job for any of ``stages``; ``None`` when the queue is idle."""
    if not stages:
        return None
    token = str(uuid.uuid4())
    async with pool.acquire() as connection:
        return await connection.fetchrow(
            CLAIM, list(stages), token, owner, lease_seconds
        )


async def heartbeat(
    pool: asyncpg.Pool,
    job_id: str,
    lease_token: str,
    lease_seconds: int = LEASE_SECONDS,
) -> bool:
    async with pool.acquire() as connection:
        tag = await connection.execute(
            HEARTBEAT, job_id, lease_token, lease_seconds
        )
    return _updated(tag) == 1


async def succeed(pool: asyncpg.Pool, job_id: str, lease_token: str) -> bool:
    async with pool.acquire() as connection:
        tag = await connection.execute(SUCCEED, job_id, lease_token)
    return _updated(tag) == 1


async def fail(
    pool: asyncpg.Pool,
    job: asyncpg.Record,
    decision: RetryDecision,
    code: str,
) -> bool:
    """Record the failure and mirror it onto the submission, as engine.ts:228 does."""
    async with pool.acquire() as connection:
        async with connection.transaction():
            updated = await connection.fetchrow(
                FAIL,
                job["id"],
                job["lease_token"],
                decision.state,
                code[:100],
                decision.delay_ms,
            )
            if updated is None:
                return False
            if job["submission_id"] and decision.state != "cancelled":
                input_revision = (job["data"] or {}).get("inputRevision")
                if input_revision:
                    await connection.execute(
                        SUBMISSION_STATE,
                        job["submission_id"],
                        job["school_id"],
                        input_revision,
                        "queued"
                        if decision.state == "retry_wait"
                        else decision.state,
                    )
            return True


async def reap_attempt_limit(pool: asyncpg.Pool) -> int:
    async with pool.acquire() as connection:
        return _updated(await connection.execute(REAP_ATTEMPT_LIMIT))
