"""Port of ``runtime/private-layout.spec.ts``.

The page that reaches the model must have the background and every redaction
whited out, and an unreadable layout must stop the job instead of guessing.
"""

from __future__ import annotations

import io

import pytest
from PIL import Image

from assessment_worker.db.jobs import JobError
from assessment_worker.private_layout import private_page

SIZE = 80

LAYOUT = {
    "safeToRead": True,
    "primaryPolygon": [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]],
    "redactions": [[[0.3, 0.3], [0.5, 0.3], [0.5, 0.5], [0.3, 0.5]]],
}


def black_page() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (SIZE, SIZE), "black").save(buffer, "JPEG")
    return buffer.getvalue()


def test_masks_background_and_redactions_before_the_reader_receives_the_page():
    result = private_page(
        {"bytes": black_page(), "width": SIZE, "height": SIZE}, LAYOUT
    )
    assert result["primary"] == LAYOUT["primaryPolygon"]
    with Image.open(io.BytesIO(result["bytes"])) as masked:
        assert masked.format == "JPEG"
        pixels = masked.convert("RGB").load()

    def value(x: int, y: int) -> int:
        return pixels[x, y][0]

    assert value(5, 5) > 230  # outside the main sheet
    assert value(32, 32) > 230  # inside a redaction
    assert value(50, 50) < 25  # the answer area survives


def test_refuses_an_unreadable_layout():
    with pytest.raises(JobError) as error:
        private_page(
            {"bytes": black_page(), "width": SIZE, "height": SIZE},
            {"safeToRead": False},
        )
    assert str(error.value) == "privacy_layout_review_required"


def test_a_confirmed_primary_polygon_overrides_the_model_layout():
    custom = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]]
    result = private_page(
        {"bytes": black_page(), "width": SIZE, "height": SIZE}, LAYOUT, custom
    )
    assert result["primary"] == custom
