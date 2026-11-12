"""Worker entrypoint: claim loop, lease heartbeat, readiness file, SIGTERM.

Mirrors ``src/workers/assessment-worker.main.ts`` without BullMQ: PostgreSQL is
the queue, so the loop polls ``school_assessment_jobs`` directly.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import shutil
import signal
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import asyncpg

from .config import ConfigError, DatabaseConfig, WorkerConfig
from .db import jobs
from .db.pool import create_pool
from .processor import process
from .storage import AssessmentStorage
from .workspace import workspace_root

LOG = logging.getLogger("assessment_worker")

POLL_SECONDS = 1.0
HEALTH_SECONDS = 30
ABANDONED_WORKSPACE_SECONDS = 86400


def _write_private(path: Path, text: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(text)


class Worker:
    def __init__(
        self,
        config: WorkerConfig,
        pool: asyncpg.Pool,
        storage: AssessmentStorage,
    ) -> None:
        self.config = config
        self.pool = pool
        self.storage = storage
        self.owner = str(uuid.uuid4())
        self.stopping = asyncio.Event()

    async def run(self) -> None:
        workspace_root(self.config.workspace)
        self._remove_abandoned_workspaces()
        with contextlib.suppress(FileNotFoundError):
            self.config.heartbeat.unlink()
        # Fail readiness before claiming anything: a worker that cannot store
        # objects must not take a seal job it will only have to fail.
        await self.storage.ready()
        health = asyncio.create_task(self._health())
        try:
            await self._loop()
        finally:
            health.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await health
            with contextlib.suppress(FileNotFoundError):
                self.config.heartbeat.unlink()

    def _remove_abandoned_workspaces(self) -> None:
        # Only directories an older process left behind, never live work.
        now = time.time()
        for entry in self.config.workspace.iterdir():
            if not entry.name.startswith("assessment-"):
                continue
            try:
                info = entry.lstat()
            except FileNotFoundError:
                continue
            if (
                entry.is_dir()
                and not entry.is_symlink()
                and now - info.st_mtime > ABANDONED_WORKSPACE_SECONDS
            ):
                shutil.rmtree(entry, ignore_errors=True)

    async def _loop(self) -> None:
        while not self.stopping.is_set():
            try:
                await jobs.reap_attempt_limit(self.pool)
                job = await jobs.claim_next(
                    self.pool, owner=self.owner, stages=self.config.stages
                )
            except Exception:
                # A broken claim must be visible: the next poll retries, but it
                # is logged with the traceback rather than silently skipped.
                LOG.exception("claim_failed")
                await self._idle()
                continue
            if job is None:
                await self._idle()
                continue
            await self._execute(job)

    async def _idle(self) -> None:
        with contextlib.suppress(asyncio.TimeoutError):
            await asyncio.wait_for(self.stopping.wait(), timeout=POLL_SECONDS)

    async def _execute(self, job: asyncpg.Record) -> None:
        token = job["lease_token"]
        beat = asyncio.create_task(self._heartbeat(job["id"], token))
        try:
            await process(self.pool, self.storage, self.config.workspace, job)
            await jobs.succeed(self.pool, job["id"], token)
        except Exception as error:
            code = jobs.error_code(error)
            decision = jobs.retry_decision(code, job["attempt_count"])
            try:
                await jobs.fail(self.pool, job, decision, code)
            except Exception:
                # Recording the failure is best effort: the lease expires and
                # the job is claimable again, which is exactly the crash path.
                LOG.exception("fail_record_failed job=%s", job["id"])
            else:
                LOG.warning(
                    "job_%s job=%s stage=%s attempt=%s code=%s",
                    decision.state,
                    job["id"],
                    job["stage"],
                    job["attempt_count"],
                    code,
                )
        finally:
            beat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await beat

    async def _heartbeat(self, job_id: str, token: str) -> None:
        while True:
            await asyncio.sleep(jobs.HEARTBEAT_SECONDS)
            try:
                await jobs.heartbeat(self.pool, job_id, token)
            except Exception:
                LOG.exception("heartbeat_failed job=%s", job_id)

    async def _health(self) -> None:
        while True:
            try:
                await self.pool.fetchval("SELECT 1")
                _write_private(
                    self.config.heartbeat, _timestamp()
                )
            except Exception:
                LOG.exception("health_failed")
                with contextlib.suppress(FileNotFoundError):
                    self.config.heartbeat.unlink()
            await asyncio.sleep(HEALTH_SECONDS)


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _run(config: WorkerConfig, db_config: DatabaseConfig) -> int:
    pool = await create_pool(db_config.dsn, max_size=config.pool_max_size)
    try:
        worker = Worker(config, pool, AssessmentStorage())
        loop = asyncio.get_running_loop()
        for signal_name in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(signal_name, worker.stopping.set)
        await worker.run()
    except asyncio.CancelledError:
        raise
    except Exception:
        LOG.exception("worker_failed")
        return 1
    finally:
        await pool.close()
    return 0


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("ASSESSMENT_LOG_LEVEL") or "INFO",
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    try:
        config = WorkerConfig.from_env()
        db_config = DatabaseConfig.from_env()
    except ConfigError as error:
        LOG.error("configuration_invalid code=%s", error)
        return 1
    return asyncio.run(_run(config, db_config))


if __name__ == "__main__":
    sys.exit(main())
