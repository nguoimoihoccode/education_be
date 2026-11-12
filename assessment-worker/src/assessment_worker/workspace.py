"""Workspace admission, ported from ``preparation.ts:35-53``."""

from __future__ import annotations

import math
import os
import stat
from pathlib import Path

from .db.jobs import JobError


def workspace_root(root: Path) -> None:
    """Create the root if needed and refuse anything but a real directory."""
    if not root.is_absolute():
        raise JobError("workspace_root_invalid")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = os.lstat(root)
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise JobError("workspace_root_invalid")


def check_workspace_admission(root: Path, min_free_gib: float) -> None:
    if not math.isfinite(min_free_gib) or min_free_gib < 0:
        raise JobError("workspace_limit_invalid")
    workspace_root(root)
    stats = os.statvfs(root)
    needed = math.ceil(min_free_gib * 1024**3)
    if stats.f_bavail * stats.f_frsize < needed:
        raise JobError("workspace_disk_low")
