"""Published-snapshot export, ported from ``runtime/export.ts``.

The report renders ``snapshot_manifest`` — the scores frozen when the
publication was finalized — never the current mutable grade rows. Column order
and the score arithmetic (``normalizedScoreTenths / 10``) are part of the file
contract, so they are fixed here rather than derived from the manifest.
"""

from __future__ import annotations

import io
import os
from typing import Any, Mapping, Sequence
from xml.sax.saxutils import escape

from openpyxl import Workbook
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

from .canonical import js_number
from .db.jobs import JobError

PDF_MIME = "application/pdf"
XLSX_MIME = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)

# DejaVu lives in a different directory on Debian and Alpine; an image that
# serves Vietnamese reports embeds its own copy of it.
DEFAULT_FONT_CANDIDATES = (
    "/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans.ttf",
)

FONT_NAME = "AssessmentSans"

MARGIN = 40
PAGE_BREAK = 730
CONTENT_WIDTH = A4[0] - 2 * MARGIN

HEADERS = (
    "Student ID",
    "Student name",
    "Score",
    "Publication revision",
    "Publication ID",
    "Review ID",
    "Requested at",
)

TITLE_STYLE = ParagraphStyle(
    "title", fontName=FONT_NAME, fontSize=16, leading=19.2
)
META_STYLE = ParagraphStyle("meta", fontName=FONT_NAME, fontSize=9, leading=10.8)
ROW_STYLE = ParagraphStyle("row", fontName=FONT_NAME, fontSize=10, leading=12)
DETAIL_STYLE = ParagraphStyle(
    "detail", fontName=FONT_NAME, fontSize=7, leading=8.4
)


def _rows(snapshot: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Same column names and insertion order as the TypeScript object literal."""
    rows: list[dict[str, Any]] = []
    for publication in snapshot["publications"]:
        rows.append(
            {
                "Student ID": publication["studentId"],
                "Student name": publication.get("studentName") or "",
                "Score": publication["normalizedScoreTenths"] / 10,
                "Publication revision": publication["revision"],
                "Publication ID": publication["publicationId"],
                "Review ID": publication["reviewRevisionId"],
                "Requested at": snapshot["requestedAt"],
            }
        )
    return rows


def resolve_font_path(explicit: str | None = None) -> str:
    """``export.ts:resolveFontPath`` — fail instead of emitting mangled text."""
    configured = explicit or os.environ.get("ASSESSMENT_PDF_FONT_PATH")
    if configured:
        if not os.path.exists(configured):
            raise JobError("pdf_font_unavailable")
        return configured
    for candidate in DEFAULT_FONT_CANDIDATES:
        if os.path.exists(candidate):
            return candidate
    raise JobError("pdf_font_unavailable")


def _xlsx(snapshot: Mapping[str, Any], rows: Sequence[Mapping[str, Any]]) -> bytes:
    book = Workbook()
    sheet = book.active
    sheet.title = "Published scores"
    book.properties.title = snapshot.get("title")
    sheet.append(list(HEADERS))
    for row in rows:
        sheet.append([row[header] for header in HEADERS])
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def _block(
    pdf: Canvas, paragraph: Paragraph, cursor: float, gap: float = 0.0
) -> float:
    """Draw ``paragraph`` with its top at ``cursor``; return the new cursor."""
    _, height = paragraph.wrapOn(pdf, CONTENT_WIDTH, A4[1])
    paragraph.drawOn(pdf, MARGIN, A4[1] - cursor - height)
    return cursor + height + gap


def _pdf(
    snapshot: Mapping[str, Any],
    rows: Sequence[Mapping[str, Any]],
    font_path: str,
) -> bytes:
    pdfmetrics.registerFont(TTFont(FONT_NAME, font_path))
    buffer = io.BytesIO()
    pdf = Canvas(buffer, pagesize=A4, pageCompression=1)
    pdf.setTitle(snapshot.get("title") or "")

    cursor = MARGIN
    cursor = _block(pdf, Paragraph(escape(snapshot["title"]), TITLE_STYLE), cursor)
    cursor = _block(
        pdf,
        Paragraph(escape(f"Snapshot: {snapshot['requestedAt']}"), META_STYLE),
        cursor,
    )
    cursor += META_STYLE.leading
    for row in rows:
        if cursor > PAGE_BREAK:
            pdf.showPage()
            cursor = MARGIN
        # ``js_number`` prints 73 as "73", the way the Node template literal does.
        line = (
            f"{row['Student name']} (ID: {row['Student ID']})     "
            f"Score: {js_number(row['Score'])}/10     "
            f"Revision: {row['Publication revision']}"
        )
        cursor = _block(pdf, Paragraph(escape(line), ROW_STYLE), cursor)
        detail = (
            f"Publication: {row['Publication ID']} / "
            f"Review: {row['Review ID']}"
        )
        cursor = _block(pdf, Paragraph(escape(detail), DETAIL_STYLE), cursor)
        cursor += DETAIL_STYLE.leading

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def render_report(
    report_format: str,
    snapshot: Mapping[str, Any],
    font_path: str | None = None,
) -> bytes:
    rows = _rows(snapshot)
    if report_format == "xlsx":
        return _xlsx(snapshot, rows)
    if report_format != "pdf":
        raise JobError("export_format_invalid")
    return _pdf(snapshot, rows, resolve_font_path(font_path))
