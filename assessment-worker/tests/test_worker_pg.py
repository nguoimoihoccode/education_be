"""``seal`` end to end: claim, storage, fenced write, retry decision.

The storage is the real ``AssessmentStorage`` over a fake S3 client, so the
key layout, checksum and mime checks under test are the shipped ones.
"""

from __future__ import annotations

import asyncio
import io
import os
import time
import uuid
from pathlib import Path

import pytest

from assessment_worker.config import WorkerConfig
from assessment_worker.db import jobs
from assessment_worker.main import Worker
from assessment_worker.processor import process
from assessment_worker.storage import AssessmentStorage, storage_key

pytestmark = pytest.mark.skipif(
    os.environ.get("ASSESSMENT_TEST_PG") != "true",
    reason="set ASSESSMENT_TEST_PG=true to run against PostgreSQL",
)

BUCKET = "assessment-test"
PDF = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n"


class FakeS3:
    """Only the calls ``storage.py`` makes, with the same response shapes."""

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.versions = 0
        self.fail_get = False

    def head_bucket(self, *, Bucket: str) -> None:
        assert Bucket

    def put_object(
        self, *, Bucket: str, Key: str, Body: bytes, **kwargs: object
    ) -> dict[str, str]:
        self.objects[(Bucket, Key)] = Body
        self.versions += 1
        return {"VersionId": f"v{self.versions}"}

    def get_object(
        self, *, Bucket: str, Key: str, VersionId: str | None = None
    ) -> dict[str, object]:
        if self.fail_get:
            raise RuntimeError("storage down")
        body = self.objects[(Bucket, Key)]
        return {"Body": io.BytesIO(body), "ContentLength": len(body)}

    def delete_object(
        self, *, Bucket: str, Key: str, VersionId: str | None = None
    ) -> None:
        self.objects.pop((Bucket, Key), None)


def _worker(pool, workspace: Path, storage) -> Worker:
    config = WorkerConfig(
        workspace=workspace,
        heartbeat=workspace / "heartbeat",
        stages=("seal",),
        pool_max_size=2,
    )
    return Worker(config, pool, storage)


async def _insert_asset(
    pool,
    *,
    school_id: str,
    assessment_id: str,
    data: bytes,
    declared_mime: str = "application/pdf",
) -> str:
    asset_id = str(uuid.uuid4())
    await pool.execute(
        """INSERT INTO school_assessment_assets
                (id,school_id,assessment_id,purpose,original_name,declared_mime,
                 byte_size,staging_key,state)
            VALUES ($1,$2,$3,'submission','scan.pdf',$4,$5,$6,'staged')""",
        asset_id,
        school_id,
        assessment_id,
        declared_mime,
        len(data),
        storage_key(school_id, assessment_id, asset_id, "staging"),
    )
    return asset_id


async def _insert_job(pool, *, school_id: str, assessment_id: str, asset_id: str) -> str:
    return str(
        await pool.fetchval(
            """INSERT INTO school_assessment_jobs
                    (school_id,assessment_id,stage,scope_key,input_hash,data,
                     routing_policy_hash,producer_agent)
                VALUES ($1,$2,'seal','scope','hash',$3::jsonb,'policy','api')
                RETURNING id""",
            school_id,
            assessment_id,
            {"assetId": asset_id},
        )
    )


async def _job_row(pool, job_id: str):
    return await pool.fetchrow(
        "SELECT state,last_error_code,lease_token FROM school_assessment_jobs "
        "WHERE id=$1",
        job_id,
    )


@pytest.fixture
def storage() -> AssessmentStorage:
    return AssessmentStorage(client=FakeS3(), bucket=BUCKET)


@pytest.fixture
def s3(storage: AssessmentStorage) -> FakeS3:
    return storage.client()


async def test_seal_verifies_the_staged_object_and_seals_it(
    pool, tmp_path, storage, s3
):
    school_id = str(uuid.uuid4())
    assessment_id = str(uuid.uuid4())
    asset_id = await _insert_asset(
        pool, school_id=school_id, assessment_id=assessment_id, data=PDF
    )
    s3.objects[(BUCKET, storage_key(school_id, assessment_id, asset_id, "staging"))] = PDF
    job_id = await _insert_job(
        pool, school_id=school_id, assessment_id=assessment_id, asset_id=asset_id
    )

    worker = _worker(pool, tmp_path, storage)
    claimed = await jobs.claim_next(pool, owner="w", stages=["seal"])
    await worker._execute(claimed)

    row = await _job_row(pool, job_id)
    assert (row["state"], row["lease_token"]) == ("succeeded", None)

    asset = await pool.fetchrow(
        "SELECT state,sha256,sealed_key,storage_version_id,verified_mime,sealed_at "
        "FROM school_assessment_assets WHERE id=$1",
        asset_id,
    )
    assert asset["state"] == "sealed"
    assert len(asset["sha256"]) == 64
    assert asset["sealed_key"] == (
        f"{storage_key(school_id, assessment_id, asset_id, 'sealed')}"
        f"/{asset['sha256']}"
    )
    assert asset["verified_mime"] == "application/pdf"
    assert asset["storage_version_id"] == "v1"
    assert asset["sealed_at"] is not None
    assert s3.objects[(BUCKET, asset["sealed_key"])] == PDF


async def test_a_mime_mismatch_fails_the_job_without_sealing(
    pool, tmp_path, storage, s3
):
    school_id = str(uuid.uuid4())
    assessment_id = str(uuid.uuid4())
    asset_id = await _insert_asset(
        pool,
        school_id=school_id,
        assessment_id=assessment_id,
        data=PDF,
        declared_mime="image/png",
    )
    s3.objects[(BUCKET, storage_key(school_id, assessment_id, asset_id, "staging"))] = PDF
    job_id = await _insert_job(
        pool, school_id=school_id, assessment_id=assessment_id, asset_id=asset_id
    )

    worker = _worker(pool, tmp_path, storage)
    claimed = await jobs.claim_next(pool, owner="w", stages=["seal"])
    await worker._execute(claimed)

    row = await _job_row(pool, job_id)
    assert row["state"] == "failed"
    assert row["last_error_code"] == "document_mime_mismatch"
    assert await pool.fetchval(
        "SELECT state FROM school_assessment_assets WHERE id=$1", asset_id
    ) == "staged"


async def test_an_already_sealed_asset_is_a_no_op(pool, tmp_path, storage, s3):
    school_id = str(uuid.uuid4())
    assessment_id = str(uuid.uuid4())
    asset_id = await _insert_asset(
        pool, school_id=school_id, assessment_id=assessment_id, data=PDF
    )
    await pool.execute(
        "UPDATE school_assessment_assets SET state='sealed',sealed_key='sealed' "
        "WHERE id=$1",
        asset_id,
    )
    job_id = await _insert_job(
        pool, school_id=school_id, assessment_id=assessment_id, asset_id=asset_id
    )

    worker = _worker(pool, tmp_path, storage)
    claimed = await jobs.claim_next(pool, owner="w", stages=["seal"])
    await worker._execute(claimed)

    assert (await _job_row(pool, job_id))["state"] == "succeeded"
    # Nothing was read or copied a second time.
    assert s3.objects == {}
    assert await pool.fetchval(
        "SELECT sealed_key FROM school_assessment_assets WHERE id=$1", asset_id
    ) == "sealed"


async def test_a_retryable_storage_error_waits_before_the_next_attempt(
    pool, tmp_path, s3
):
    school_id = str(uuid.uuid4())
    assessment_id = str(uuid.uuid4())
    asset_id = await _insert_asset(
        pool, school_id=school_id, assessment_id=assessment_id, data=PDF
    )
    s3.objects[(BUCKET, storage_key(school_id, assessment_id, asset_id, "staging"))] = PDF
    job_id = await _insert_job(
        pool, school_id=school_id, assessment_id=assessment_id, asset_id=asset_id
    )

    class FlakyStorage(AssessmentStorage):
        async def read(self, key: str, limit: int = 0) -> bytes:
            raise jobs.JobError("provider_http_503")

    worker = _worker(pool, tmp_path, FlakyStorage(client=s3, bucket=BUCKET))
    claimed = await jobs.claim_next(pool, owner="w", stages=["seal"])
    await worker._execute(claimed)

    row = await pool.fetchrow(
        "SELECT state,last_error_code,next_attempt_at>now() AS delayed "
        "FROM school_assessment_jobs WHERE id=$1",
        job_id,
    )
    assert row["state"] == "retry_wait"
    assert row["last_error_code"] == "provider_http_503"
    assert row["delayed"]


async def test_another_workers_asset_is_not_found(pool, tmp_path, storage, s3):
    school_id = str(uuid.uuid4())
    other_school = str(uuid.uuid4())
    assessment_id = str(uuid.uuid4())
    asset_id = await _insert_asset(
        pool,
        school_id=other_school,
        assessment_id=assessment_id,
        data=PDF,
    )
    job_id = await _insert_job(
        pool, school_id=school_id, assessment_id=assessment_id, asset_id=asset_id
    )

    worker = _worker(pool, tmp_path, storage)
    claimed = await jobs.claim_next(pool, owner="w", stages=["seal"])
    await worker._execute(claimed)

    row = await _job_row(pool, job_id)
    assert row["state"] == "failed"
    assert row["last_error_code"] == "asset_not_found"


async def test_the_loop_claims_processes_and_stops_on_signal(
    pool, tmp_path, storage, s3
):
    school_id = str(uuid.uuid4())
    assessment_id = str(uuid.uuid4())
    jobs_seen = []
    for _ in range(2):
        asset_id = await _insert_asset(
            pool, school_id=school_id, assessment_id=assessment_id, data=PDF
        )
        s3.objects[
            (BUCKET, storage_key(school_id, assessment_id, asset_id, "staging"))
        ] = PDF
        jobs_seen.append(
            await _insert_job(
                pool,
                school_id=school_id,
                assessment_id=assessment_id,
                asset_id=asset_id,
            )
        )

    worker = _worker(pool, tmp_path, storage)
    loop = asyncio.create_task(worker._loop())
    try:
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            states = await pool.fetch(
                "SELECT state FROM school_assessment_jobs"
            )
            if all(row["state"] == "succeeded" for row in states):
                break
            await asyncio.sleep(0.02)
        else:
            raise AssertionError("the loop did not drain the queue")
    finally:
        # SIGTERM after the in-flight job finished; the idle wait must return
        # immediately instead of sleeping out POLL_SECONDS.
        worker.stopping.set()
        await asyncio.wait_for(loop, timeout=3)

    assert len(jobs_seen) == 2
    assert (
        await pool.fetchval(
            "SELECT count(*) FROM school_assessment_jobs WHERE state='succeeded'"
        )
        == 2
    )


async def test_a_stage_this_worker_cannot_run_is_rejected(pool, tmp_path, storage):
    # All four real stages are implemented, so the guard is pinned with a name
    # that never appears in VALID_STAGES.
    with pytest.raises(jobs.JobError, match="unsupported_job_stage"):
        await process(
            pool,
            storage,
            tmp_path,
            {"stage": "template", "school_id": str(uuid.uuid4())},
        )


SNAPSHOT = {
    "title": "Exam",
    "requestedAt": "2026-11-04T00:00:00Z",
    "publications": [
        {
            "publicationId": "p",
            "revision": 2,
            "studentId": 7,
            "studentName": "Lê An",
            "normalizedScoreTenths": 73,
            "reviewRevisionId": "r",
            "contextSnapshot": {},
        }
    ],
}


async def _insert_export(
    pool,
    *,
    school_id: str,
    assessment_id: str,
    report_format: str = "xlsx",
    expires_in: str = "1 hour",
):
    export_id = str(uuid.uuid4())
    await pool.execute(
        "INSERT INTO school_assessment_exports"
        " (id,school_id,assessment_id,format,snapshot_manifest,created_by,"
        " expires_at)"
        f" VALUES ($1,$2,$3,$4,$5::jsonb,1,now()+interval '{expires_in}')",
        export_id,
        school_id,
        assessment_id,
        report_format,
        SNAPSHOT,
    )
    job_id = str(
        await pool.fetchval(
            """INSERT INTO school_assessment_jobs
                    (school_id,assessment_id,stage,scope_key,input_hash,data,
                     routing_policy_hash,producer_agent)
                VALUES ($1,$2,'export','scope','hash',$3::jsonb,'policy','api')
                RETURNING id""",
            school_id,
            assessment_id,
            {"exportId": export_id},
        )
    )
    return export_id, job_id


async def test_export_renders_the_frozen_snapshot_and_completes_the_row(
    pool, tmp_path, storage, s3
):
    school_id = str(uuid.uuid4())
    assessment_id = str(uuid.uuid4())
    export_id, job_id = await _insert_export(
        pool, school_id=school_id, assessment_id=assessment_id
    )

    worker = _worker(pool, tmp_path, storage)
    claimed = await jobs.claim_next(pool, owner="w", stages=["export"])
    await worker._execute(claimed)

    assert (await _job_row(pool, job_id))["state"] == "succeeded"
    row = await pool.fetchrow(
        "SELECT state,output_object_key FROM school_assessment_exports WHERE id=$1",
        export_id,
    )
    assert row["state"] == "completed"
    assert row["output_object_key"] == (
        f"assessment/{school_id}/{assessment_id}/exports/{export_id}.xlsx"
    )
    assert s3.objects[(BUCKET, row["output_object_key"])].startswith(b"PK")


async def test_an_expired_export_fails_without_writing_an_object(
    pool, tmp_path, storage, s3
):
    school_id = str(uuid.uuid4())
    assessment_id = str(uuid.uuid4())
    export_id, job_id = await _insert_export(
        pool,
        school_id=school_id,
        assessment_id=assessment_id,
        expires_in="-1 hour",
    )

    worker = _worker(pool, tmp_path, storage)
    claimed = await jobs.claim_next(pool, owner="w", stages=["export"])
    await worker._execute(claimed)

    row = await _job_row(pool, job_id)
    assert (row["state"], row["last_error_code"]) == ("failed", "export_expired")
    assert s3.objects == {}
    assert await pool.fetchval(
        "SELECT state FROM school_assessment_exports WHERE id=$1", export_id
    ) == "queued"
