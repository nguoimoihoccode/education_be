"""Port of ``runtime/preparation.spec.ts``.

The PDF branches run against a fake ``pdfinfo``/``pdftoppm`` (the Node spec
mocks ``execFile`` for the same reason): the point is which metadata is
rejected *before* rendering and that every temporary file is removed, not that
Poppler works. The image branch uses real Pillow encoding, so the 2048 px bound
is measured on actual pixels.
"""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from PIL import Image

from assessment_worker import preparation
from assessment_worker.db.jobs import JobError
from assessment_worker.preparation import prepare_document
from assessment_worker.workspace import check_workspace_admission


def png(width: int, height: int) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buffer, "PNG")
    return buffer.getvalue()


def jpeg(width: int, height: int) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(buffer, "JPEG")
    return buffer.getvalue()


async def test_resizes_real_images_into_bounded_jpeg_pages_and_cleans_up(tmp_path):
    pages = await prepare_document(png(3000, 100), "image/png", tmp_path)
    assert len(pages) == 1
    assert {
        key: pages[0][key]
        for key in ("mime", "width", "height", "pageNumber")
    } == {
        "mime": "image/jpeg",
        "width": 2048,
        "height": 68,
        "pageNumber": 1,
    }
    with Image.open(io.BytesIO(pages[0]["bytes"])) as encoded:
        assert encoded.format == "JPEG"
    assert list(tmp_path.iterdir()) == []


async def test_rejects_mime_mismatch_pixel_overflow_and_workspace_overflow(tmp_path):
    image = png(20, 20)
    with pytest.raises(JobError) as mismatch:
        await prepare_document(image, "image/jpeg", tmp_path)
    assert str(mismatch.value) == "document_mime_mismatch"
    with pytest.raises(JobError) as pixels:
        await prepare_document(image, "image/png", tmp_path, {"max_pixels": 100})
    assert str(pixels.value) == "document_pixel_limit"
    with pytest.raises(JobError) as workspace:
        await prepare_document(
            image, "image/png", tmp_path, {"max_workspace_bytes": 1}
        )
    assert str(workspace.value) == "workspace_limit"
    assert list(tmp_path.iterdir()) == []


def fake_pdfinfo(metadata: str):
    calls: list[tuple[str, list[str]]] = []

    async def run(binary: str, arguments: list[str]) -> str:
        calls.append((binary, arguments))
        if binary == "pdfinfo":
            return metadata if len(arguments) == 1 else metadata
        raise AssertionError(binary)

    return run, calls


@pytest.mark.parametrize(
    "metadata",
    ["Pages: 31\nEncrypted: no", "Pages: 1\nEncrypted: yes"],
)
async def test_rejects_unsafe_pdf_metadata_before_rendering(
    tmp_path, monkeypatch, metadata
):
    run, calls = fake_pdfinfo(metadata)
    monkeypatch.setattr(preparation, "_process_document", run)
    with pytest.raises(JobError):
        await prepare_document(b"%PDF-1.7\n", "application/pdf", tmp_path)
    assert len(calls) == 1
    assert list(tmp_path.iterdir()) == []


async def test_renders_one_pdf_page_at_a_time_and_cleans_up(tmp_path, monkeypatch):
    page = jpeg(20, 30)
    calls: list[tuple[str, list[str]]] = []

    async def run(binary: str, arguments: list[str]) -> str:
        calls.append((binary, arguments))
        if binary == "pdfinfo":
            if len(arguments) == 1:
                return "Pages: 2\nEncrypted: no"
            return "Page size: 600 x 800 pts"
        assert binary == "pdftoppm"
        with open(f"{arguments[-1]}.jpg", "wb") as rendered:
            rendered.write(page)
        return ""

    monkeypatch.setattr(preparation, "_process_document", run)
    pages = await prepare_document(b"%PDF-1.7\n", "application/pdf", tmp_path)
    assert [entry["pageNumber"] for entry in pages] == [1, 2]
    renders = [arguments for binary, arguments in calls if binary == "pdftoppm"]
    assert len(renders) == 2
    for argument in ("-f", "-l", "-singlefile", "-scale-to", "2048", "-jpeg"):
        assert argument in renders[0]
    assert list(tmp_path.iterdir()) == []


async def test_fails_the_job_when_the_renderer_fails(tmp_path, monkeypatch):
    async def run(binary: str, arguments: list[str]) -> str:
        raise JobError("document_process_failed")

    monkeypatch.setattr(preparation, "_process_document", run)
    with pytest.raises(JobError) as error:
        await prepare_document(b"%PDF-1.7\n", "application/pdf", tmp_path)
    assert str(error.value) == "document_process_failed"
    assert list(tmp_path.iterdir()) == []


async def test_refuses_oversized_pages_before_invoking_the_renderer(
    tmp_path, monkeypatch
):
    calls: list[str] = []

    async def run(binary: str, arguments: list[str]) -> str:
        calls.append(binary)
        if len(arguments) == 1:
            return "Pages: 1\nEncrypted: no"
        return "Page size: 100000 x 100000 pts"

    monkeypatch.setattr(preparation, "_process_document", run)
    with pytest.raises(JobError) as error:
        await prepare_document(b"%PDF-1.7\n", "application/pdf", tmp_path)
    assert str(error.value) == "document_pixel_limit"
    assert "pdftoppm" not in calls
    assert list(tmp_path.iterdir()) == []


async def test_checks_real_filesystem_admission_and_rejects_bad_roots(tmp_path):
    check_workspace_admission(tmp_path, 0)
    with pytest.raises(JobError) as disk:
        check_workspace_admission(tmp_path, 2**53 - 1)
    assert str(disk.value) == "workspace_disk_low"
    with pytest.raises(JobError) as root:
        check_workspace_admission(Path("../request-path"), 0)
    assert str(root.value) == "workspace_root_invalid"
    with pytest.raises(JobError) as limit:
        check_workspace_admission(tmp_path, -1)
    assert str(limit.value) == "workspace_limit_invalid"
    with pytest.raises(JobError) as pages:
        await prepare_document(
            b"x", "image/png", tmp_path, {"max_pages": float("inf")}
        )
    assert str(pages.value) == "document_limit_invalid"
