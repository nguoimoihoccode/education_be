"""Printed-question matching, ported from ``runtime/exam-match.ts``.

``examEvidence`` decides whether a reader fragment agrees with an exam version
document: ``match`` (every question reproduced), ``incomplete`` (missing or
unreadable evidence) or ``conflict`` (contradictory evidence). The distinction
is what turns into ``exam_version_confirmation_required`` versus
``exam_code_conflict``, so the normalisation below is behaviour, not cosmetics.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

Evidence = str

_SUPERSCRIPT = re.compile(r"[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+")
_FRACTION = re.compile(r"\\frac\{([^{}]+)\}\{([^{}]+)\}")
_LATEX_SIZE = re.compile(r"\\(?:left|right)\b")
_SUBSCRIPT = re.compile(r"_(?:\{([a-z0-9]+)\}|([a-z0-9]))")
_MINUS = re.compile(r"[−–]")
_BRACED_EXPONENT = re.compile(r"\^\{([+-]?\d+)\}")
_SPACE = re.compile(r"\s+")
_MULTIPLICATION = re.compile(r"(?<=\d)[×x](?=\d)")
_TRAILING_PUNCTUATION = re.compile(r"[.?:]+$")


def printed_text(value: str) -> str:
    text = _SUPERSCRIPT.sub(
        lambda match: "^" + unicodedata.normalize("NFKC", match.group(0)),
        value,
    )
    text = unicodedata.normalize("NFKC", text).lower()
    text = _FRACTION.sub(r"(\1)/(\2)", text)
    text = _LATEX_SIZE.sub("", text)
    text = _SUBSCRIPT.sub(
        lambda match: (match.group(1) or "") + (match.group(2) or ""), text
    )
    text = _MINUS.sub("-", text)
    text = _BRACED_EXPONENT.sub(r"^\1", text)
    text = _SPACE.sub("", text)
    text = _MULTIPLICATION.sub("*", text)
    return _TRAILING_PUNCTUATION.sub("", text)


def _entries_match(expected: Any, observed: Any) -> Evidence:
    if not isinstance(expected, list):
        return "match"
    if not isinstance(observed, list):
        return "incomplete"
    previous_index = -1
    incomplete = len(observed) < len(expected)
    for entry in observed:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            return "conflict"
        index = next(
            (
                position
                for position, value in enumerate(expected)
                if isinstance(value, dict) and value.get("id") == entry["id"]
            ),
            -1,
        )
        if index <= previous_index:
            return "conflict"
        previous_index = index
        original = expected[index]
        text = entry.get("text")
        if not isinstance(text, str) or not text.strip():
            incomplete = True
        elif printed_text(str(original.get("text") or "")) != printed_text(text):
            return "conflict"
    return "incomplete" if incomplete else "match"


def exam_evidence(
    template: dict[str, Any],
    fragments: list[dict[str, Any]],
) -> Evidence:
    questions = {
        question["questionKey"]: question
        for question in template.get("questions") or []
    }
    matched: set[str] = set()
    for fragment in fragments:
        key = fragment.get("questionKey")
        question = questions.get(key) if isinstance(key, str) else None
        if question is None:
            return "conflict"
        kind = fragment.get("kind")
        if isinstance(kind, str) and kind != question.get("kind"):
            return "conflict"
        text = (
            printed_text(fragment["text"])
            if isinstance(fragment.get("text"), str)
            else ""
        )
        if text and text != printed_text(str(question.get("text") or "")):
            return "conflict"
        options = _entries_match(question.get("options"), fragment.get("options"))
        statements = _entries_match(
            question.get("statements"), fragment.get("statements")
        )
        if options == "conflict" or statements == "conflict":
            return "conflict"
        if text and options == "match" and statements == "match":
            matched.add(key)  # type: ignore[arg-type]
    return (
        "match"
        if len(matched) == len(questions) and questions
        else "incomplete"
    )
