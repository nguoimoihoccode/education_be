"""Pure scoring rules, ported from ``domain/assessment.policy.ts``.

Only the parts the worker calls are here; the API keeps its own copy of the
input validation. ``normalize_score`` is the rounding rule the review revision
inherits, so it must stay identical to ``Math.floor((2e+100m)/2m)`` — integer
math, never a float.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence

from ..canonical import hash_value
from ..db.jobs import JobError

__all__ = [
    "hash",
    "normalize_score",
    "score_objective",
    "summarize_results",
]

SAFE_INTEGER = 2**53 - 1


def hash(value: Any) -> str:  # noqa: A001 - mirrors the Node export name
    return hash_value(value)


def _safe_integer(value: Any) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and abs(value) <= SAFE_INTEGER
    )


def normalize_score(earned: int, maximum: int) -> int:
    if (
        not _safe_integer(earned)
        or not _safe_integer(maximum)
        or earned < 0
        or maximum <= 0
        or earned > maximum
        or maximum > 1_000_000
    ):
        raise JobError("assessment_invalid_input")
    return (2 * earned * 100 + maximum) // (2 * maximum)


def _boolean(value: Any) -> bool:
    return isinstance(value, bool)


def score_objective(
    question: Mapping[str, Any], answer: Mapping[str, Any]
) -> int | None:
    """Rule-only score. Unknown observations stay ungraded, never zero."""
    if answer["observation_state"] == "confirmed_blank":
        return 0
    if answer["observation_state"] != "readable":
        return None
    content = answer["content"]
    if question["kind"] == "single_choice":
        options = question.get("options") or []
        selected = content.get("selectedOptionId")
        if (
            content.get("ambiguityCodes")
            or not isinstance(selected, str)
            or not any(
                isinstance(option, Mapping) and option.get("id") == selected
                for option in options
            )
        ):
            return None
        return (
            question["maxUnits"]
            if selected == question.get("answerKey")
            else 0
        )
    if question["kind"] == "true_false_group":
        ids = [statement["id"] for statement in question["statements"]]
        values = content.get("statements")
        if values is None:
            values = content.get("values")
        if values is None:
            values = content
        if any(not _boolean(values.get(identifier)) for identifier in ids):
            return None
        key = question.get("answerKey") or {}
        correct = sum(
            1 for identifier in ids if values[identifier] == key.get(identifier)
        )
        policy = question.get("scoringPolicy") or {}
        if policy.get("kind") == "count_map":
            # JSON object keys are strings; JavaScript coerces the index too.
            return policy["unitsByCorrectCount"][str(correct)]
        per = policy.get("unitsPerCorrect")
        if not _safe_integer(per):
            raise JobError("assessment_invalid_input")
        return correct * per
    return None


def summarize_results(
    results: Sequence[Mapping[str, Any]], max_units: int
) -> dict[str, int]:
    earned_units = 0
    ungraded_max_units = 0
    for result in results:
        if result.get("earnedUnits") is None:
            ungraded_max_units += result["maxUnits"]
        else:
            normalize_score(result["earnedUnits"], result["maxUnits"])
            earned_units += result["earnedUnits"]
    if sum(result["maxUnits"] for result in results) != max_units:
        raise JobError("assessment_invalid_input")
    return {
        "earnedUnits": earned_units,
        "ungradedMaxUnits": ungraded_max_units,
    }
