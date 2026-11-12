"""Port of ``runtime/export.spec.ts``.

The report must describe the snapshot frozen at publication time, so the XLSX
round-trip checks the exact columns and the score arithmetic. The PDF branch
uses a real TrueType face because the reason the font is resolved at all is
that the built-in Type1 fonts cannot render Vietnamese.
"""

from __future__ import annotations

import io
import os

import pytest
import reportlab
from openpyxl import load_workbook

from assessment_worker.db.jobs import JobError
from assessment_worker.export import render_report, resolve_font_path

BUNDLED_FONT = os.path.join(
    os.path.dirname(reportlab.__file__), "fonts", "Vera.ttf"
)

SNAPSHOT = {
    "title": "Exam",
    "requestedAt": "2026-11-04T00:00:00Z",
    "publications": [
        {
            "publicationId": "p",
            "revision": 2,
            "studentId": 7,
            "normalizedScoreTenths": 73,
            "reviewRevisionId": "r",
            "contextSnapshot": {},
        }
    ],
}


def test_exports_fixed_publication_scores_instead_of_current_grades():
    book = load_workbook(io.BytesIO(render_report("xlsx", SNAPSHOT)))
    assert book.sheetnames == ["Published scores"]
    rows = list(book["Published scores"].iter_rows(values_only=True))
    assert rows[0] == (
        "Student ID",
        "Student name",
        "Score",
        "Publication revision",
        "Publication ID",
        "Review ID",
        "Requested at",
    )
    # An absent name is written as an empty cell; openpyxl reads it back as None.
    assert rows[1] == (7, None, 7.3, 2, "p", "r", "2026-11-04T00:00:00Z")


def test_keeps_the_student_name_when_the_snapshot_has_one():
    snapshot = {
        **SNAPSHOT,
        "publications": [{**SNAPSHOT["publications"][0], "studentName": "Lê An"}],
    }
    book = load_workbook(io.BytesIO(render_report("xlsx", snapshot)))
    assert list(book["Published scores"].iter_rows(values_only=True))[1][1] == "Lê An"


def test_refuses_a_missing_pdf_font_instead_of_corrupting_vietnamese_text():
    with pytest.raises(JobError) as error:
        render_report(
            "pdf",
            {"title": "Đề thi", "requestedAt": "now", "publications": []},
            "/nonexistent/font.ttf",
        )
    assert str(error.value) == "pdf_font_unavailable"


def test_falls_back_to_the_configured_font_path(monkeypatch):
    monkeypatch.setenv("ASSESSMENT_PDF_FONT_PATH", "/nonexistent/env-font.ttf")
    with pytest.raises(JobError):
        resolve_font_path()
    monkeypatch.setenv("ASSESSMENT_PDF_FONT_PATH", BUNDLED_FONT)
    assert resolve_font_path() == BUNDLED_FONT


def test_renders_a_pdf_with_a_real_true_type_face():
    snapshot = {
        **SNAPSHOT,
        "publications": [
            {**SNAPSHOT["publications"][0], "studentName": "Nguyễn Văn A"}
        ],
    }
    data = render_report("pdf", snapshot, BUNDLED_FONT)
    assert data.startswith(b"%PDF")
    assert len(data) > 500


def test_rejects_an_unknown_format():
    with pytest.raises(JobError) as error:
        render_report("docx", SNAPSHOT)
    assert str(error.value) == "export_format_invalid"
