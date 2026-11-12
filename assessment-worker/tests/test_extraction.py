"""Port of ``runtime/extraction.spec.ts`` plus a prompt-drift guard.

``READER_INSTRUCTION`` is compared against the TypeScript template literal
itself, so an edit on either side fails here instead of silently changing what
the model is asked for.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from assessment_worker.db.jobs import JobError
from assessment_worker.extraction import READER_INSTRUCTION, validate_page_read, within_primary

NODE_SOURCE = (
    Path(__file__).parents[2]
    / "src"
    / "modules"
    / "assessment"
    / "runtime"
    / "extraction.ts"
)


def node_reader_instruction() -> str:
    source = NODE_SOURCE.read_text("utf-8")
    match = re.search(
        r"export const READER_INSTRUCTION = `([^`]*)`;", source, re.DOTALL
    )
    assert match is not None
    return match.group(1)


def test_reader_instruction_is_verbatim_from_the_typescript_source():
    assert READER_INSTRUCTION == node_reader_instruction()


def test_rejects_evidence_from_a_background_sheet():
    assert (
        within_primary(
            [[0.9, 0.9], [1, 0.9], [1, 1]],
            [[0, 0], [0.7, 0], [0.7, 0.7], [0, 0.7]],
        )
        is False
    )


def test_rejects_invented_roles_and_malformed_coordinate_bounds():
    with pytest.raises(JobError) as error:
        validate_page_read(
            {
                "pageRole": "mixed",
                "primaryPolygon": [[0, 0], [1, 0], [1, 1], [0, 1]],
                "examCode": "102",
                "questionFragments": [],
                "regions": [
                    {
                        "regionKey": "x",
                        "role": "system",
                        "polygon": [[0, 0], [1, 0], [1, 1]],
                    }
                ],
            }
        )
    assert str(error.value) == "reader_schema_invalid"


def page(**overrides):
    value = {
        "pageRole": "written_answer",
        "primaryPolygon": [[0, 0], [1, 0], [1, 1], [0, 1]],
        "examCode": "102",
        "questionFragments": [
            {"questionKey": "I.1", "text": "Tính 5 - 2"}
        ],
        "regions": [
            {
                "regionKey": "r1",
                "role": "student_choice",
                "questionKey": "I.1",
                "polygon": [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4]],
                "text": "A",
                "content": {"selectedOptionId": "A"},
                "observationState": "readable",
            }
        ],
    }
    value.update(overrides)
    return value


def test_accepts_a_grounded_page():
    assert validate_page_read(page()) == page()


def test_rejects_duplicate_region_keys():
    region = page()["regions"][0]
    with pytest.raises(JobError) as error:
        validate_page_read(page(regions=[region, {**region, "role": "student_text"}]))
    assert str(error.value) == "reader_duplicate_region"


def test_rejects_evidence_that_leaves_the_primary_sheet():
    region = {
        **page()["regions"][0],
        "polygon": [[0.8, 0.8], [0.9, 0.8], [0.9, 0.9]],
    }
    with pytest.raises(JobError) as error:
        validate_page_read(
            page(primaryPolygon=[[0, 0], [0.7, 0], [0.7, 0.7], [0, 0.7]], regions=[region])
        )
    assert str(error.value) == "reader_background_evidence"


def test_background_regions_may_sit_outside_the_primary_sheet():
    region = {
        **page()["regions"][0],
        "role": "background",
        "polygon": [[0.8, 0.8], [0.9, 0.8], [0.9, 0.9]],
    }
    validate_page_read(
        page(primaryPolygon=[[0, 0], [0.7, 0], [0.7, 0.7], [0, 0.7]], regions=[region])
    )
