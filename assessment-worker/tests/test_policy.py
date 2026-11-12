"""Port of ``domain/assessment.policy.spec.ts`` (worker-used rules only).

``assertExamDocument``/``assertReviewPublishable``/``assertRevision`` stay on the
API side: ``processor.ts`` imports only ``hash``, ``scoreObjective`` and
``summarizeResults``.

Note the key casing: ``question`` is the camelCase template document, while
``answer`` is the snake_case revision dict the worker builds and reads — the same
shape ``external_text_worker`` consumes.
"""

from __future__ import annotations

import pytest

from assessment_worker.db.jobs import JobError
from assessment_worker.domain.policy import (
    normalize_score,
    score_objective,
    summarize_results,
)


def test_half_up_integer_scoring_without_per_criterion_rounding():
    assert normalize_score(7250, 10000) == 73
    assert normalize_score(250, 1000) == 25


@pytest.mark.parametrize(
    "earned,maximum", [(-1, 1), (2, 1), (0, 0), (1.5, 10), (1, 1000001)]
)
def test_normalize_score_rejects_invalid_units(earned, maximum):
    with pytest.raises(JobError) as error:
        normalize_score(earned, maximum)
    assert str(error.value) == "assessment_invalid_input"


def _answer(observation_state="readable", **content):
    return {"observation_state": observation_state, "content": content}


SINGLE_CHOICE = {
    "questionKey": "I.1",
    "kind": "single_choice",
    "text": "Tính 5 − 2?",
    "maxUnits": 250,
    "options": [{"id": "A", "text": "3"}, {"id": "B", "text": "7"}],
    "answerKey": "A",
}


def test_unrecognized_choice_is_ungraded_not_zero():
    assert score_objective(SINGLE_CHOICE, _answer(selectedOptionId="Z")) is None
    assert score_objective(SINGLE_CHOICE, _answer(selectedOptionId="A")) == 250
    assert score_objective(SINGLE_CHOICE, _answer(selectedOptionId="B")) == 0
    assert (
        score_objective(
            SINGLE_CHOICE,
            _answer(selectedOptionId="A", ambiguityCodes=["multiple_choices"]),
        )
        is None
    )


def test_unknown_observations_stay_ungraded():
    assert score_objective(SINGLE_CHOICE, _answer("not_found")) is None
    assert score_objective(SINGLE_CHOICE, _answer("unreadable")) is None
    assert score_objective(SINGLE_CHOICE, _answer("confirmed_blank")) == 0


TRUE_FALSE = {
    "questionKey": "I.13",
    "kind": "true_false_group",
    "text": "Đúng hay sai?",
    "maxUnits": 250,
    "statements": [{"id": "a", "text": "1"}, {"id": "b", "text": "2"}],
    "answerKey": {"a": True, "b": False},
    "scoringPolicy": {"kind": "units_per_correct", "unitsPerCorrect": 125},
}


def test_true_false_group_counts_units_per_correct():
    assert (
        score_objective(TRUE_FALSE, _answer(statements={"a": True, "b": False}))
        == 250
    )
    assert (
        score_objective(TRUE_FALSE, _answer(statements={"a": True, "b": True}))
        == 125
    )


def test_true_false_group_prefers_statement_values_then_the_content_itself():
    assert score_objective(TRUE_FALSE, _answer(values={"a": True, "b": False})) == 250
    assert score_objective(TRUE_FALSE, _answer(a=True, b=False)) == 250
    # A non-boolean observation is unreadable evidence, never a wrong answer.
    assert score_objective(TRUE_FALSE, _answer(statements={"a": True})) is None


def test_true_false_group_reads_the_count_map_policy():
    counted = {
        **TRUE_FALSE,
        "scoringPolicy": {
            "kind": "count_map",
            "unitsByCorrectCount": {"0": 0, "1": 125, "2": 250},
        },
    }
    assert (
        score_objective(counted, _answer(statements={"a": True, "b": False}))
        == 250
    )


def test_summarize_results_separates_ungraded_max_units():
    results = [
        {"earnedUnits": 250, "maxUnits": 250},
        {"earnedUnits": None, "maxUnits": 500},
        {"earnedUnits": 0, "maxUnits": 250},
    ]
    assert summarize_results(results, 1000) == {
        "earnedUnits": 250,
        "ungradedMaxUnits": 500,
    }


def test_summarize_results_requires_the_exact_maximum():
    with pytest.raises(JobError) as error:
        summarize_results([{"earnedUnits": 0, "maxUnits": 250}], 1000)
    assert str(error.value) == "assessment_invalid_input"


def test_summarize_results_validates_each_earned_value():
    with pytest.raises(JobError):
        summarize_results([{"earnedUnits": 300, "maxUnits": 250}], 250)
