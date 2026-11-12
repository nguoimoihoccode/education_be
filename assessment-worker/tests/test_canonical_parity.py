"""Pin the Python JSON/hash spelling to the Node implementation.

The expected hashes in ``hash-vectors.json`` are produced by
``scripts/emit-hash-vectors.mjs`` from the real ``JSON.stringify`` semantics.
A failure here means the API and the worker would disagree about
``routing_policy_hash`` / ``request_hash`` / ``content_hash``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from assessment_worker.canonical import digest, hash_value, js_number

FIXTURES = Path(__file__).parent / "fixtures"
VECTORS = json.loads((FIXTURES / "hash-vectors.json").read_text())


@pytest.mark.parametrize("case", VECTORS["hash"], ids=range(len(VECTORS["hash"])))
def test_hash_matches_node(case):
    assert hash_value(case["input"]) == case["expected"]


@pytest.mark.parametrize("case", VECTORS["digest"], ids=range(len(VECTORS["digest"])))
def test_digest_preserves_insertion_order(case):
    assert digest(case["input"]) == case["expected"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (1.0, "1"),
        (100.0, "100"),
        (0.05, "0.05"),
        (0.1, "0.1"),
        (1e-6, "0.000001"),
        (1e-7, "1e-7"),
        (1.5e-7, "1.5e-7"),
        (1e21, "1e+21"),
        (1.2345678901234568e20, "123456789012345680000"),
        (-0.0, "0"),
        (8.5, "8.5"),
        (12345678901234567890, "12345678901234567000"),
    ],
)
def test_number_spelling_follows_ecmascript(value, expected):
    assert js_number(value) == expected


def test_keys_sort_by_utf16_code_unit_not_code_point():
    # U+FFFD (0xFFFD) sorts before the astral key (surrogate 0xD83E) in UTF-16,
    # while a code-point sort would put the astral key first.
    from assessment_worker.canonical import stable

    value = stable({"�": "replacement", "\U0001f98a": "astral"})
    assert list(value) == ["\U0001f98a", "�"]
