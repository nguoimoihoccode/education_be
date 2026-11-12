"""The per-job routing gate — the highest-risk parity row in the plan.

``engine.ts:237-253`` refuses a job whose snapshot no longer hashes to the
value the API stored. Getting this wrong pauses every queued job, so the three
outcomes are pinned here rather than only exercised through a database.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from assessment_worker import processor
from assessment_worker.canonical import hash_value
from assessment_worker.db.jobs import JobError

EXAMPLE = (
    Path(__file__).resolve().parents[2]
    / "docs"
    / "assessment"
    / "contracts"
    / "agent-routing.example.json"
)


def snapshot() -> dict:
    cfg = json.loads(EXAMPLE.read_text("utf-8"))
    cfg["deploymentState"] = "pilot"
    for profile in cfg["profiles"].values():
        profile["qualityGate"] = "passed"
    return cfg


def job(cfg: dict, **overrides) -> dict:
    value = {
        "data": {
            "inputRevision": 3,
            "routingSnapshot": json.dumps(cfg),
        },
        "routing_policy_hash": hash_value(cfg),
        "routing_version": cfg.get("routingVersion", "1"),
    }
    value.update(overrides)
    return value


def test_accepts_a_snapshot_that_still_hashes_to_the_stored_value():
    cfg = snapshot()
    assert processor._routing(job(cfg)) == cfg


def test_requires_a_snapshot():
    with pytest.raises(JobError) as error:
        processor._routing(
            {"data": {}, "routing_policy_hash": "x", "routing_version": "1"}
        )
    assert str(error.value) == "routing_snapshot_required"


def test_rejects_a_drifted_snapshot():
    cfg = snapshot()
    edited = copy.deepcopy(cfg)
    edited["policy"]["maxProviderCallsPerTemplate"] = (
        cfg["policy"]["maxProviderCallsPerTemplate"] - 1
    )
    stale = job(cfg)
    stale["data"] = {"inputRevision": 3, "routingSnapshot": json.dumps(edited)}
    with pytest.raises(JobError) as error:
        processor._routing(stale)
    assert str(error.value) == "routing_snapshot_mismatch"


def test_rejects_a_snapshot_from_another_routing_version():
    cfg = snapshot()
    current = job(cfg, routing_version="2")
    with pytest.raises(JobError) as error:
        processor._routing(current)
    assert str(error.value) == "routing_snapshot_mismatch"


def test_accepts_an_embedded_snapshot_object_as_well_as_a_string():
    cfg = snapshot()
    value = job(cfg)
    value["data"] = {"inputRevision": 3, "routingSnapshot": cfg}
    assert processor._routing(value) == cfg


def test_flag_drops_an_absent_question_key_instead_of_nulling_it():
    assert processor.flag("answer_key_unapproved") == {
        "code": "answer_key_unapproved",
        "severity": "blocking",
        "message": "Cần duyệt đáp án và thang điểm của mã đề.",
        "resolutionState": "open",
    }
    assert list(processor.flag("answer_not_found", "I.1")) == [
        "code",
        "severity",
        "questionKey",
        "message",
        "resolutionState",
    ]


def test_normalize_matches_the_node_text_comparison():
    assert processor._normalize("Tính 5 − 2?") == processor._normalize("Tính 5 - 2")
    assert processor._normalize("Đúng") == "đúng"
    assert processor._normalize("Câu 1: ĐÚNG!") == "câu1đúng"
