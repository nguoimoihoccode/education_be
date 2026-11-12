"""External text grading, ported from ``runtime/external-text.ts``.

This is the only path that lets student text leave the VPS, so every guard is
behaviour: the per-assessment allow-list, the release event with its hash
binding, the roster identity scan, the HMAC-signed request, and the
``external_grading_unavailable`` outcome that an uncertain delivery produces.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import time
import unicodedata
from typing import Any, Mapping, Sequence
from urllib.parse import urlsplit

import httpx

from .canonical import stringify
from .db.jobs import JobError
from .inference import read_bounded_response

TEXT_RELEASE_EVENT = "external_text_released"
TEXT_REVOKE_EVENT = "external_text_revoked"
MANUAL_ONLY_EVENT = "manual_grading_selected"

SAFE_INTEGER = 2**53 - 1
_POLICY = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_SECRET = re.compile(r"^[A-Za-z0-9_-]{32,256}$")


def _digest(body: str) -> str:
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def text_payload_hash(payload: Mapping[str, Any]) -> str:
    return _digest(stringify(payload))


def external_text_policy(assessment_id: str) -> str | None:
    if os.environ.get("ASSESSMENT_EXTERNAL_GRADING_ENABLED") != "true":
        return None
    enabled = (os.environ.get("ASSESSMENT_EXTERNAL_GRADING_ASSESSMENT_IDS") or "")
    if assessment_id not in [item.strip() for item in enabled.split(",")]:
        return None
    value = os.environ.get("ASSESSMENT_EXTERNAL_GRADING_POLICY") or ""
    return value if _POLICY.fullmatch(value) else None


def _integer_value(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def text_payload(
    question: Mapping[str, Any], content: Any
) -> dict[str, Any] | None:
    criteria = question.get("criteria")
    if (
        question.get("kind") != "rubric_text"
        or not isinstance(criteria, list)
        or not criteria
        or len(criteria) > 12
        or not isinstance(content, Mapping)
    ):
        return None
    value = content.get("text")
    if not isinstance(value, str) or not value.strip() or len(value) > 2500:
        return None
    answer = value.strip()
    payload_criteria: list[dict[str, Any]] = []
    for index, criterion in enumerate(criteria):
        description = criterion.get("description")
        levels = criterion.get("levels")
        if (
            not isinstance(description, str)
            or not description.strip()
            or len(description) > 1200
            or not isinstance(levels, list)
            or not levels
            or len(levels) > 12
        ):
            return None
        units: list[int] = []
        for level in levels:
            unit = (
                level.get("pointsUnits")
                if isinstance(level, Mapping)
                else None
            )
            number = _integer_value(unit)
            if (
                number is None
                or number < 0
                or number > criterion["maxUnits"]
                or abs(number) > SAFE_INTEGER
            ):
                return None
            units.append(number)
        # Level wording is part of the rubric, not metadata to discard.
        rubric = "\n".join(
            [
                f"Câu hỏi: {question['text'].strip()}",
                description.strip(),
                *[
                    f"{level['pointsUnits']}: "
                    f"{level['description'].strip() if isinstance(level.get('description'), str) else ''}"
                    for level in levels
                ],
            ]
        )
        if len(rubric) > 1200:
            return None
        payload_criteria.append(
            {
                "id": f"c{index + 1}",
                "description": rubric,
                "allowedUnits": list(dict.fromkeys(units)),
            }
        )
    payload = {"answer": answer, "criteria": payload_criteria}
    return payload if len(stringify(payload).encode()) <= 16 * 1024 else None


def comparable(value: str) -> str:
    text = unicodedata.normalize("NFKD", value).lower()
    text = "".join(
        character
        for character in text
        if not unicodedata.category(character).startswith("M")
    )
    text = text.replace("đ", "d")
    text = "".join(
        character if unicodedata.category(character)[:1] in ("L", "N") else " "
        for character in text
    )
    return " ".join(text.split())


def contains_roster_identity(
    payload: Mapping[str, Any],
    roster: Sequence[Mapping[str, Any]],
) -> bool:
    pieces = [
        f" {comparable(part)} "
        for part in [
            payload["answer"],
            *[criterion["description"] for criterion in payload["criteria"]],
        ]
    ]
    for student in roster:
        name = comparable(student["display_name_snapshot"] or "")
        code = comparable(student["student_code_snapshot"] or "")
        if any(
            (len(name) >= 3 and f" {name} " in piece)
            or (len(code) >= 4 and f" {code} " in piece)
            for piece in pieces
        ):
            return True
    return False


def validate_external_grades(
    raw: Any,
    payload: Mapping[str, Any],
    question: Mapping[str, Any],
    region_ids: Sequence[str],
) -> list[dict[str, Any]]:
    rows = raw.get("criteria") if isinstance(raw, Mapping) else None
    if (
        not region_ids
        or not isinstance(rows, list)
        or len(rows) != len(payload["criteria"])
    ):
        raise JobError("external_grading_response_invalid")
    grades: list[dict[str, Any]] = []
    for index, item in enumerate(payload["criteria"]):
        matches = [
            row
            for row in rows
            if isinstance(row, Mapping) and row.get("id") == item["id"]
        ]
        grade = matches[0] if matches else None
        earned = grade.get("earnedUnits") if grade is not None else None
        reason = grade.get("reason") if grade is not None else None
        points = _integer_value(earned)
        allowed = points is not None and points in item["allowedUnits"]
        if (
            len(matches) != 1
            or not allowed
            or not isinstance(reason, str)
            or not reason.strip()
            or len(reason) > 350
        ):
            raise JobError("external_grading_response_invalid")
        grades.append(
            {
                "criterionId": question["criteria"][index]["id"],
                "pointsUnits": points,
                "reason": reason,
                "evidenceRegionIds": list(region_ids),
            }
        )
    return grades


async def request_external_text_grade(
    payload: Mapping[str, Any], policy: str
) -> Any:
    if (
        os.environ.get("ASSESSMENT_EXTERNAL_GRADING_ENABLED") != "true"
        or os.environ.get("ASSESSMENT_EXTERNAL_GRADING_POLICY") != policy
    ):
        raise JobError("external_grading_unavailable")
    parts = urlsplit(os.environ.get("ASSESSMENT_EXTERNAL_GRADING_URL") or "")
    token = os.environ.get("ASSESSMENT_EXTERNAL_GRADING_TOKEN") or ""
    key = os.environ.get("ASSESSMENT_EXTERNAL_GRADING_SIGNING_KEY") or ""
    if (
        parts.scheme not in ("http", "https")
        or parts.hostname not in ("assessment-external-grading", "127.0.0.1")
        or parts.path != "/"
        or parts.query
        or parts.fragment
        or parts.username
        or parts.password
        or not _SECRET.fullmatch(token)
        or not _SECRET.fullmatch(key)
        or token == key
    ):
        raise JobError("external_grading_unavailable")
    body = stringify(payload)
    expires = str(int(time.time()) + 30)
    nonce = (
        base64.urlsafe_b64encode(os.urandom(24)).decode("ascii").rstrip("=")
    )
    signature = hmac.new(
        key.encode("utf-8"),
        f"{policy}.{expires}.{nonce}.{_digest(body)}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    try:
        async with httpx.AsyncClient(
            follow_redirects=False, timeout=httpx.Timeout(50.0)
        ) as client:
            async with client.stream(
                "POST",
                f"{parts.scheme}://{parts.netloc}/v1/grade-text",
                content=body.encode("utf-8"),
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                    "X-Assessment-Policy": policy,
                    "X-Assessment-Expires": expires,
                    "X-Assessment-Nonce": nonce,
                    "X-Assessment-Signature": signature,
                },
            ) as response:
                if response.status_code != 200:
                    raise JobError("external_grading_unavailable")
                return json.loads(await read_bounded_response(response))
    except (httpx.HTTPError, ValueError, JobError):
        raise JobError("external_grading_unavailable") from None
