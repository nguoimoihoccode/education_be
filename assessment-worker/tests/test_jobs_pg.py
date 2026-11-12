"""Job lifecycle against a real PostgreSQL, gated the same way as the Node suite.

Run with ``ASSESSMENT_TEST_PG=true`` and a reachable server; the ``pool``
fixture in ``conftest.py`` gives each test its own schema.
"""

from __future__ import annotations

import os
import uuid
from datetime import timedelta

import pytest

from assessment_worker.db import jobs

pytestmark = pytest.mark.skipif(
    os.environ.get("ASSESSMENT_TEST_PG") != "true",
    reason="set ASSESSMENT_TEST_PG=true to run against PostgreSQL",
)


async def _insert_job(
    pool,
    *,
    stage: str = "seal",
    state: str = "pending",
    attempt_count: int = 0,
    delay: timedelta = timedelta(0),
    submission_id: str | None = None,
    data: dict | None = None,
) -> str:
    job_id = await pool.fetchval(
        """INSERT INTO school_assessment_jobs
                (school_id,submission_id,stage,scope_key,input_hash,data,state,
                 attempt_count,next_attempt_at,routing_policy_hash,producer_agent)
            VALUES (gen_random_uuid(),$1,$2,'scope','hash',$3::jsonb,$4,$5,
                    now()+$6::interval,'policy','api')
            RETURNING id""",
        submission_id,
        stage,
        data or {},
        state,
        attempt_count,
        delay,
    )
    return str(job_id)


async def test_claims_a_pending_job_and_counts_the_attempt(pool):
    job_id = await _insert_job(pool, stage="seal", data={"inputRevision": 2})
    claimed = await jobs.claim_next(pool, owner="worker-1", stages=["seal"])
    assert claimed is not None
    assert str(claimed["id"]) == job_id
    assert claimed["data"] == {"inputRevision": 2}
    row = await pool.fetchrow(
        "SELECT state,attempt_count,fencing_token,lease_owner FROM "
        "school_assessment_jobs WHERE id=$1",
        claimed["id"],
    )
    assert (row["state"], row["attempt_count"], row["fencing_token"]) == (
        "running",
        1,
        1,
    )
    assert row["lease_owner"] == "worker-1"


async def test_stage_filter_leaves_other_stages_alone(pool):
    seal = await _insert_job(pool, stage="seal")
    grade = await _insert_job(pool, stage="grade")
    claimed = await jobs.claim_next(pool, owner="w", stages=["grade"])
    assert str(claimed["id"]) == grade
    # An empty stage list claims nothing at all.
    assert await jobs.claim_next(pool, owner="w", stages=[]) is None
    row = await pool.fetchrow(
        "SELECT state FROM school_assessment_jobs WHERE id=$1", seal
    )
    assert row["state"] == "pending"


async def test_a_live_lease_is_not_stolen_but_an_expired_one_is(pool):
    job_id = await _insert_job(pool, stage="seal")
    first = await jobs.claim_next(pool, owner="w1", stages=["seal"])
    assert await jobs.claim_next(pool, owner="w2", stages=["seal"]) is None
    await pool.execute(
        "UPDATE school_assessment_jobs SET lease_until=now()-interval '1 second' "
        "WHERE id=$1",
        first["id"],
    )
    second = await jobs.claim_next(pool, owner="w2", stages=["seal"])
    assert str(second["id"]) == job_id
    assert second["attempt_count"] == 2


async def test_dispatched_ignores_the_retry_delay_like_the_node_worker(pool):
    await _insert_job(
        pool, stage="seal", state="dispatched", delay=timedelta(seconds=30)
    )
    claimed = await jobs.claim_next(pool, owner="w", stages=["seal"])
    assert claimed is not None


async def test_retry_wait_honours_the_delay(pool):
    await _insert_job(
        pool,
        stage="seal",
        state="retry_wait",
        delay=timedelta(seconds=10),
    )
    assert await jobs.claim_next(pool, owner="w", stages=["seal"]) is None


async def test_exhausted_jobs_are_never_claimed(pool):
    await _insert_job(pool, stage="seal", attempt_count=3, state="pending")
    assert await jobs.claim_next(pool, owner="w", stages=["seal"]) is None


async def test_heartbeat_extends_only_with_the_lease_token(pool):
    await _insert_job(pool, stage="seal")
    claimed = await jobs.claim_next(pool, owner="w", stages=["seal"])
    before = await pool.fetchval(
        "SELECT lease_until FROM school_assessment_jobs WHERE id=$1",
        claimed["id"],
    )
    assert await jobs.heartbeat(pool, claimed["id"], claimed["lease_token"])
    after = await pool.fetchval(
        "SELECT lease_until FROM school_assessment_jobs WHERE id=$1",
        claimed["id"],
    )
    assert after > before
    other = str(uuid.uuid4())
    assert not await jobs.heartbeat(pool, claimed["id"], other)


async def test_success_clears_the_lease(pool):
    await _insert_job(pool, stage="seal")
    claimed = await jobs.claim_next(pool, owner="w", stages=["seal"])
    assert await jobs.succeed(pool, claimed["id"], claimed["lease_token"])
    row = await pool.fetchrow(
        "SELECT state,lease_token,lease_owner,lease_until FROM "
        "school_assessment_jobs WHERE id=$1",
        claimed["id"],
    )
    assert row["state"] == "succeeded"
    assert (row["lease_token"], row["lease_owner"], row["lease_until"]) == (
        None,
        None,
        None,
    )
    # A stale token cannot flip a finished job.
    assert not await jobs.succeed(pool, claimed["id"], claimed["lease_token"])


async def test_retry_mirrors_queued_onto_the_submission(pool):
    job_id = await _insert_job(pool, stage="seal")
    school_id = await pool.fetchval(
        "SELECT school_id FROM school_assessment_jobs WHERE id=$1", job_id
    )
    submission_id = str(uuid.uuid4())
    await pool.execute(
        "INSERT INTO school_assessment_submissions (id,school_id,input_revision) "
        "VALUES ($1,$2,4)",
        submission_id,
        school_id,
    )
    claimed = await jobs.claim_next(pool, owner="w", stages=["seal"])
    # The claim returns the row before the failure, so build the record the
    # processor would hold: same job columns plus the submission revision.
    job = dict(claimed, submission_id=submission_id, data={"inputRevision": 4})
    decision = jobs.retry_decision("provider_http_503", 1)
    assert await jobs.fail(pool, job, decision, "provider_http_503")
    row = await pool.fetchrow(
        "SELECT state,last_error_code,lease_token,next_attempt_at>now() AS delayed "
        "FROM school_assessment_jobs WHERE id=$1",
        claimed["id"],
    )
    assert row["state"] == "retry_wait"
    assert row["last_error_code"] == "provider_http_503"
    assert row["lease_token"] is None
    assert row["delayed"]
    state = await pool.fetchval(
        "SELECT processing_state FROM school_assessment_submissions WHERE id=$1",
        submission_id,
    )
    assert state == "queued"


async def test_reaper_fails_jobs_that_used_their_attempts(pool):
    job_id = await _insert_job(pool, stage="seal", state="running", attempt_count=3)
    await pool.execute(
        "UPDATE school_assessment_jobs SET lease_until=now()-interval '1 second' "
        "WHERE id=$1",
        job_id,
    )
    assert await jobs.reap_attempt_limit(pool) == 1
    row = await pool.fetchrow(
        "SELECT state,last_error_code FROM school_assessment_jobs WHERE id=$1",
        job_id,
    )
    assert row["state"] == "failed"
    assert row["last_error_code"] == "attempt_limit"
