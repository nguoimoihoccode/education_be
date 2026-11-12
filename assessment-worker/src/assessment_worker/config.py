"""Configuration read from the same environment variables as the Node worker."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping
from urllib.parse import quote

VALID_STAGES = ("seal", "extract", "grade", "export")


class ConfigError(RuntimeError):
    """The environment cannot produce a usable configuration."""


def _int(env: Mapping[str, str], name: str, default: int) -> int:
    raw = env.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as error:
        raise ConfigError(f"invalid_integer:{name}") from error


@dataclass(frozen=True)
class DatabaseConfig:
    """Names match ``src/database/data-source.ts``."""

    host: str
    port: int
    user: str
    password: str
    database: str

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> "DatabaseConfig":
        return cls(
            host=env.get("DB_HOST") or "localhost",
            port=_int(env, "DB_PORT", 5432),
            user=env.get("DB_USERNAME") or "postgres",
            password=env.get("DB_PASSWORD") or "postgres",
            database=env.get("DB_DATABASE") or "stock_db",
        )

    @property
    def dsn(self) -> str:
        # Credentials are percent-encoded: a password containing @ or / must not
        # be able to change which host or database the worker connects to.
        return (
            f"postgresql://{quote(self.user, safe='')}:{quote(self.password, safe='')}"
            f"@{self.host}:{self.port}/{self.database}"
        )


@dataclass(frozen=True)
class WorkerConfig:
    """Names match ``src/workers/assessment-worker.main.ts``."""

    workspace: Path
    heartbeat: Path
    stages: tuple[str, ...]
    pool_max_size: int

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> "WorkerConfig":
        if env.get("ASSESSMENT_ENABLED") != "true":
            raise ConfigError("assessment_disabled")
        workspace = Path(
            env.get("ASSESSMENT_WORKSPACE_PATH") or "/app/workspace"
        ).resolve()
        configured = env.get("ASSESSMENT_WORKER_HEARTBEAT_PATH")
        heartbeat = (
            Path(configured).resolve() if configured else workspace / "heartbeat"
        )
        # The readiness probe reads this file; keeping it inside the workspace
        # means a stale file cannot outlive the volume it describes.
        if not heartbeat.is_relative_to(workspace):
            raise ConfigError("heartbeat_path_invalid")
        stages = tuple(
            (env.get("ASSESSMENT_WORKER_PYTHON_STAGES") or "")
            .replace(",", " ")
            .split()
        )
        unsupported = [stage for stage in stages if stage not in VALID_STAGES]
        if unsupported:
            raise ConfigError(f"unsupported_python_stages:{','.join(unsupported)}")
        return cls(
            workspace=workspace,
            heartbeat=heartbeat,
            # Empty by default: until a cutover sets this, the Python worker
            # claims nothing and the Node worker keeps every stage.
            stages=stages,
            pool_max_size=_int(env, "ASSESSMENT_WORKER_DB_POOL", 4),
        )
