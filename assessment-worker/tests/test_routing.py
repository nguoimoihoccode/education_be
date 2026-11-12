"""Parity tests for ``routing.ts``.

Every case here exists in ``runtime/routing.spec.ts``. The fixture is the same
example snapshot the Node tests read, so a divergence in the schema handling
shows up as a pytest failure instead of as a paused job in production.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from assessment_worker.db.jobs import JobError
from assessment_worker.routing import (
    parse_routing,
    reserve_cost_micros,
    select_profile,
)

EXAMPLE = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "assessment"
    / "contracts"
    / "agent-routing.example.json"
)


def fixture() -> dict:
    return json.loads(EXAMPLE.read_text("utf-8"))


def benchmarked() -> dict:
    cfg = copy.deepcopy(fixture())
    cfg["deploymentState"] = "pilot"
    for profile in cfg["profiles"].values():
        profile["qualityGate"] = "passed"
    return cfg


def test_refuses_a_design_only_config_for_paid_execution() -> None:
    with pytest.raises(JobError, match="routing_not_pilot"):
        parse_routing(fixture(), "2026-11-04")


def test_refuses_an_unbenchmarked_active_profile() -> None:
    cfg = copy.deepcopy(fixture())
    cfg["deploymentState"] = "pilot"
    with pytest.raises(JobError, match="profile_not_ready"):
        parse_routing(cfg, "2026-11-04")


def test_refuses_every_profile_once_the_date_passes_the_price_snapshot() -> None:
    # ``today()`` falls back to UTC; a date past every validThroughDate must
    # fail admission rather than run on a stale price (routing.ts:126).
    with pytest.raises(JobError, match="profile_expired_or_unavailable"):
        parse_routing(benchmarked(), "2027-01-01")


def test_pins_model_and_price_expiry_before_admitting_a_call() -> None:
    parsed = parse_routing(benchmarked(), "2026-11-04")
    with pytest.raises(JobError, match="profile_expired_or_unavailable"):
        select_profile(parsed, "image_reader", True, "2026-12-01")
    with pytest.raises(JobError, match="vision_required"):
        select_profile(parsed, "text_grader", True, "2026-11-04")


def test_reserves_worst_case_output_with_integer_ceiling() -> None:
    assert reserve_cost_micros(1, 1, 300_000, 2_500_000) == 3
    with pytest.raises(JobError, match="cost_invalid"):
        reserve_cost_micros(-1, 2, 1, 1)


def test_refuses_a_schema_valid_provider_dialect_mismatch() -> None:
    cfg = benchmarked()
    first = next(iter(cfg["profiles"]))
    cfg["profiles"][first]["apiDialect"] = "openai_chat_completions"
    with pytest.raises(JobError, match="provider_dialect_invalid"):
        parse_routing(cfg, "2026-11-04")


def test_rejects_a_relative_disk_threshold_pair() -> None:
    cfg = benchmarked()
    cfg["execution"]["pauseBelowFreeDiskGiB"] = cfg["execution"][
        "admitFreeDiskGiB"
    ]
    with pytest.raises(JobError, match="disk_thresholds_invalid"):
        parse_routing(cfg, "2026-11-04")


def test_rejects_a_malformed_calendar_date_the_way_ajv_formats_does() -> None:
    cfg = benchmarked()
    cfg["profiles"]["gemini25_reader"]["pricing"]["validThroughDate"] = (
        "2026-13-45"
    )
    with pytest.raises(Exception):
        parse_routing(cfg, "2026-11-04")


def test_selects_the_fallback_when_the_primary_is_out_of_date() -> None:
    cfg = benchmarked()
    cfg["profiles"]["gemini25_reader"]["allowThroughDate"] = "2026-11-01"
    parsed = parse_routing(cfg, "2026-11-04")
    profile_id, profile = select_profile(
        parsed, "image_reader", True, "2026-11-04"
    )
    assert profile_id == "gemini35_reader"
    assert profile["provider"] == "google"
