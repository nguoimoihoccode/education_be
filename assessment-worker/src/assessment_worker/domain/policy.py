"""Pure scoring rules, ported from ``domain/assessment.policy.ts``.

Only the parts the worker calls are here; the API keeps its own copy of the
input validation. ``normalize_score`` is the rounding rule the review revision
inherits, so it must stay identical to ``Math.floor((2e+100m)/2m)`` — integer
math, never a float.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Mapping, Sequence

from ..canonical import hash_value
from ..db.jobs import JobError

__all__ = [
    "hash",
    "normalize_score",
    "near_short_answer",
    "normalize_short_answer",
    "parse_short_number",
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


# ASCII digits only, like JavaScript's \d in ``parseShortNumber``.
_NUMBER = re.compile(r"[-+]?[0-9]+(?:[.,][0-9]+)?")
_THOUSANDS = re.compile(r"[-+]?[0-9]+\.[0-9]{3}")
_TRAILING = re.compile(r"[\s.,;:!?]+$")


def normalize_short_answer(value: str) -> str:
    """Mirror of ``normalizeShortAnswer``: case, spacing and trailing
    punctuation do not matter; Vietnamese accents do."""
    text = " ".join(unicodedata.normalize("NFC", value).lower().split())
    return _TRAILING.sub("", text).strip()


def _fold_short_answer(value: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFD", value)
        if not unicodedata.category(char).startswith("M")
    ).replace("đ", "d")


def _within_one_edit(a: str, b: str) -> bool:
    if abs(len(a) - len(b)) > 1:
        return False
    i = 0
    while i < len(a) and i < len(b) and a[i] == b[i]:
        i += 1
    j = 0
    while j < len(a) - i and j < len(b) - i and a[-1 - j] == b[-1 - j]:
        j += 1
    return max(len(a), len(b)) - i - j <= 1


def near_short_answer(key: str, given: str) -> bool:
    """Mirror of ``nearShortAnswer``: differing from a key only by accents or
    one character is a likely misread, left ungraded instead of zero."""
    a, b = _fold_short_answer(key), _fold_short_answer(given)
    if a == b:
        return True
    return min(len(a), len(b)) >= 4 and _within_one_edit(a, b)


def parse_short_number(value: str) -> float | None:
    """Mirror of ``parseShortNumber``: exactly one number, comma or dot as the
    decimal mark, and ``1.000`` left ambiguous."""
    found = _NUMBER.findall(value)
    if len(found) != 1 or _THOUSANDS.fullmatch(found[0]):
        return None
    try:
        return float(found[0].replace(",", "."))
    except ValueError:
        return None


def _score_short_answer(
    question: Mapping[str, Any], content: Mapping[str, Any]
) -> int | None:
    text = content.get("text") if isinstance(content, Mapping) else None
    if not isinstance(text, str) or not text.strip():
        return None
    accepted = [
        item for item in question.get("acceptedAnswers") or [] if isinstance(item, str)
    ]
    matching = question.get("matching") or {}
    if matching.get("mode") == "number":
        given = parse_short_number(text)
        if given is None:
            return None
        tolerance = float(matching.get("tolerance") or 0) + 1e-9
        keys = [parse_short_number(item) for item in accepted]
        return (
            question["maxUnits"]
            if any(key is not None and abs(key - given) <= tolerance for key in keys)
            else 0
        )
    given_text = normalize_short_answer(text)
    keys = [normalize_short_answer(item) for item in accepted]
    if given_text in keys:
        return question["maxUnits"]
    return None if any(near_short_answer(key, given_text) for key in keys) else 0


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
    if question["kind"] == "short_answer":
        return _score_short_answer(question, content)
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
