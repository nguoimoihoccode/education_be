"""Environment parsing, using the Node worker's variable names."""

from __future__ import annotations

import pytest

from assessment_worker.config import ConfigError, DatabaseConfig, WorkerConfig


def test_database_defaults_match_data_source():
    config = DatabaseConfig.from_env({})
    assert (config.host, config.port, config.user) == ("localhost", 5432, "postgres")
    assert config.database == "stock_db"
    assert config.dsn == "postgresql://postgres:postgres@localhost:5432/stock_db"


def test_dsn_percent_encodes_credentials():
    config = DatabaseConfig.from_env(
        {"DB_USERNAME": "app@school", "DB_PASSWORD": "p@ss/word"}
    )
    assert config.dsn.startswith("postgresql://app%40school:p%40ss%2Fword@")
    assert config.dsn.endswith("/stock_db")


def test_port_must_be_numeric():
    with pytest.raises(ConfigError):
        DatabaseConfig.from_env({"DB_PORT": "five"})


def test_worker_is_disabled_unless_enabled_is_true(tmp_path):
    with pytest.raises(ConfigError, match="assessment_disabled"):
        WorkerConfig.from_env({"ASSESSMENT_WORKSPACE_PATH": str(tmp_path)})
    with pytest.raises(ConfigError, match="assessment_disabled"):
        WorkerConfig.from_env(
            {"ASSESSMENT_ENABLED": "1", "ASSESSMENT_WORKSPACE_PATH": str(tmp_path)}
        )


def test_stages_default_to_empty_so_node_keeps_everything(tmp_path):
    config = WorkerConfig.from_env(
        {"ASSESSMENT_ENABLED": "true", "ASSESSMENT_WORKSPACE_PATH": str(tmp_path)}
    )
    assert config.stages == ()
    assert config.heartbeat == config.workspace / "heartbeat"


def test_stages_accept_commas_and_spaces(tmp_path):
    config = WorkerConfig.from_env(
        {
            "ASSESSMENT_ENABLED": "true",
            "ASSESSMENT_WORKSPACE_PATH": str(tmp_path),
            "ASSESSMENT_WORKER_PYTHON_STAGES": "seal, extract  grade",
        }
    )
    assert config.stages == ("seal", "extract", "grade")


def test_unknown_stage_is_rejected(tmp_path):
    with pytest.raises(ConfigError, match="unsupported_python_stages:template"):
        WorkerConfig.from_env(
            {
                "ASSESSMENT_ENABLED": "true",
                "ASSESSMENT_WORKSPACE_PATH": str(tmp_path),
                "ASSESSMENT_WORKER_PYTHON_STAGES": "template",
            }
        )


def test_heartbeat_must_stay_inside_the_workspace(tmp_path):
    outside = tmp_path.parent / "elsewhere" / "heartbeat"
    with pytest.raises(ConfigError, match="heartbeat_path_invalid"):
        WorkerConfig.from_env(
            {
                "ASSESSMENT_ENABLED": "true",
                "ASSESSMENT_WORKSPACE_PATH": str(tmp_path),
                "ASSESSMENT_WORKER_HEARTBEAT_PATH": str(outside),
            }
        )
