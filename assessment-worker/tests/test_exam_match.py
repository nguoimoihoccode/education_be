"""Port of ``runtime/exam-match.spec.ts``.

The rule this pins: printed wording and option order decide whether a version
matches a page, so a reordered option list is a conflict even when the wording
and exam code are identical.
"""

from __future__ import annotations

from assessment_worker.exam_match import exam_evidence

TEMPLATE = {
    "examCode": "102",
    "maxScoreUnits": 250,
    "questions": [
        {
            "questionKey": "I.1",
            "kind": "single_choice",
            "text": "Tính 5 − 2?",
            "maxUnits": 250,
            "options": [{"id": "A", "text": "3"}, {"id": "B", "text": "7"}],
        }
    ],
}

FULL = {
    "questionKey": "I.1",
    "text": "Tính 5 - 2",
    "options": TEMPLATE["questions"][0]["options"],
}


def test_matches_printed_questions_and_options_while_retaining_math_signs():
    assert exam_evidence(TEMPLATE, [FULL]) == "match"
    assert exam_evidence(TEMPLATE, [{**FULL, "text": "Tính 5 + 2?"}]) == "conflict"
    assert (
        exam_evidence(TEMPLATE, [{**FULL, "text": "Khổ giấy A4 là bao nhiêu?"}])
        == "conflict"
    )


def test_distinguishes_superscripts_from_an_ordinary_digit():
    exponential = {
        **TEMPLATE,
        "questions": [{**TEMPLATE["questions"][0], "text": "Tính 2²"}],
    }
    assert (
        exam_evidence(exponential, [{**FULL, "text": "Tính 2^{2}"}]) == "match"
    )
    assert exam_evidence(exponential, [{**FULL, "text": "Tính 22"}]) == "conflict"


def test_rejects_reordered_options():
    assert (
        exam_evidence(
            TEMPLATE,
            [
                {
                    **FULL,
                    "options": [{"id": "A", "text": "7"}, {"id": "B", "text": "3"}],
                }
            ],
        )
        == "conflict"
    )


def test_distinguishes_missing_evidence_from_contradictory_evidence():
    assert exam_evidence(TEMPLATE, []) == "incomplete"
    assert (
        exam_evidence(TEMPLATE, [{"questionKey": "I.1", "text": FULL["text"]}])
        == "incomplete"
    )
    assert (
        exam_evidence(TEMPLATE, [{**FULL, "options": [{"id": "A", "text": "7"}]}])
        == "conflict"
    )
