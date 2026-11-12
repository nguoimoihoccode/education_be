"""Entrypoint wiring that needs no database: config gate and crash cleanup."""

from __future__ import annotations

import os
import time
from pathlib import Path

from assessment_worker.config import WorkerConfig
from assessment_worker.main import Worker, main


def _worker(workspace: Path) -> Worker:
    return Worker(
        WorkerConfig(
            workspace=workspace,
            heartbeat=workspace / "heartbeat",
            stages=("seal",),
            pool_max_size=1,
        ),
        pool=None,  # type: ignore[arg-type]
        storage=None,  # type: ignore[arg-type]
    )


def test_main_exits_one_when_the_feature_is_disabled(monkeypatch):
    monkeypatch.setenv("ASSESSMENT_ENABLED", "false")
    monkeypatch.setenv("ASSESSMENT_WORKSPACE_PATH", "/tmp/assessment-worker-test")
    assert main() == 1


def test_the_sweep_removes_only_old_worker_directories(tmp_path):
    now = time.time()
    old = tmp_path / "assessment-old"
    recent = tmp_path / "assessment-recent"
    unrelated = tmp_path / "other-old"
    target = tmp_path / "outside"
    link = tmp_path / "assessment-link"
    for path in (old, recent, unrelated, target):
        path.mkdir()
    os.utime(old, (now - 90000, now - 90000))
    os.utime(unrelated, (now - 90000, now - 90000))
    os.symlink(target, link)
    try:
        os.utime(link, (now - 90000, now - 90000), follow_symlinks=False)
    except (OSError, NotImplementedError):
        pass

    _worker(tmp_path)._remove_abandoned_workspaces()

    assert not old.exists()
    assert recent.is_dir()
    assert unrelated.is_dir()
    assert target.is_dir()
    assert link.is_symlink()
