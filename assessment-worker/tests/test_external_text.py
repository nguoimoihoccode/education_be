"""Port of ``runtime/external-text.spec.ts``.

This is the only path that lets student text leave the VPS, so the tests pin
the payload shape (no identifiers, no source fields), the award allow-list, the
identity scan and the refusal to open a connection when the policy is off.
"""

from __future__ import annotations

import pytest

from assessment_worker import external_text
from assessment_worker.db.jobs import JobError
from assessment_worker.external_text import (
    contains_roster_identity,
    request_external_text_grade,
    text_payload,
    validate_external_grades,
)

QUESTION = {
    "kind": "rubric_text",
    "questionKey": "II.1",
    "text": "Private prompt",
    "maxUnits": 1000,
    "criteria": [
        {
            "id": "real-id",
            "description": "Correct reasoning",
            "maxUnits": 1000,
            "levels": [
                {"pointsUnits": 0, "description": "No reason"},
                {"pointsUnits": 1000, "description": "Correct"},
            ],
        }
    ],
}

ROSTER = [
    {
        "display_name_snapshot": "Trần Văn Nam",
        "student_code_snapshot": "HSCN1234",
    }
]


def test_builds_one_text_only_payload_without_identifiers_or_source_fields():
    assert text_payload(
        QUESTION, {"text": "Answer", "studentId": 4, "image": "private"}
    ) == {
        "answer": "Answer",
        "criteria": [
            {
                "id": "c1",
                "description": (
                    "Câu hỏi: Private prompt\n"
                    "Correct reasoning\n"
                    "0: No reason\n"
                    "1000: Correct"
                ),
                "allowedUnits": [0, 1000],
            }
        ],
    }
    assert text_payload({**QUESTION, "kind": "rubric_drawing"}, {"text": "A"}) is None


@pytest.mark.parametrize(
    "text",
    ["", "   ", "x" * 2501],
)
def test_refuses_answers_that_are_empty_or_too_long(text):
    assert text_payload(QUESTION, {"text": text}) is None


def test_rejects_an_unapproved_award_and_restores_evidence_from_the_local_manifest():
    payload = text_payload(QUESTION, {"text": "Answer"})
    row = {
        "id": "c1",
        "earnedUnits": 1000,
        "reason": "Correct",
        "evidenceRegionIds": ["fake"],
    }
    assert validate_external_grades(
        {"criteria": [row]}, payload, QUESTION, ["local"]
    ) == [
        {
            "criterionId": "real-id",
            "pointsUnits": 1000,
            "reason": "Correct",
            "evidenceRegionIds": ["local"],
        }
    ]
    with pytest.raises(JobError) as error:
        validate_external_grades(
            {"criteria": [{**row, "earnedUnits": 500}]},
            payload,
            QUESTION,
            ["local"],
        )
    assert str(error.value) == "external_grading_response_invalid"


def test_accepts_an_integral_float_award_but_not_a_boolean():
    payload = text_payload(QUESTION, {"text": "Answer"})
    row = {"id": "c1", "earnedUnits": 1000.0, "reason": "Correct"}
    assert validate_external_grades({"criteria": [row]}, payload, QUESTION, ["r"])[0][
        "pointsUnits"
    ] == 1000
    with pytest.raises(JobError):
        validate_external_grades(
            {"criteria": [{**row, "earnedUnits": True}]}, payload, QUESTION, ["r"]
        )


def test_detects_roster_names_without_accents_and_codes_in_outgoing_fields():
    assert contains_roster_identity(
        text_payload(QUESTION, {"text": "Tran  Van-Nam viết."}), ROSTER
    )
    assert contains_roster_identity(
        text_payload(QUESTION, {"text": "Mã HSCN1234."}), ROSTER
    )
    assert not contains_roster_identity(
        text_payload(QUESTION, {"text": "Đáp án đã chọn."}), ROSTER
    )


async def test_does_not_open_a_connection_when_the_policy_is_disabled(monkeypatch):
    monkeypatch.setenv("ASSESSMENT_EXTERNAL_GRADING_ENABLED", "false")

    class Forbidden:
        def __init__(self, *args, **kwargs):
            raise AssertionError("client must not be created")

    monkeypatch.setattr(external_text.httpx, "AsyncClient", Forbidden)
    with pytest.raises(JobError) as error:
        await request_external_text_grade(
            text_payload(QUESTION, {"text": "Answer"}), "pilot-v1"
        )
    assert str(error.value) == "external_grading_unavailable"


def test_keeps_a_valid_confidence_and_rejects_an_unknown_one():
    payload = text_payload(QUESTION, {"text": "Answer"})
    row = {"id": "c1", "earnedUnits": 1000, "reason": "Correct"}
    grades = validate_external_grades(
        {"criteria": [{**row, "confidence": "low"}]}, payload, QUESTION, ["r"]
    )
    assert grades[0]["confidence"] == "low"
    assert "confidence" not in validate_external_grades(
        {"criteria": [row]}, payload, QUESTION, ["r"]
    )[0]
    with pytest.raises(JobError):
        validate_external_grades(
            {"criteria": [{**row, "confidence": "certain"}]},
            payload,
            QUESTION,
            ["r"],
        )
