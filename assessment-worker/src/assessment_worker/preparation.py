"""Bounded page rendering, ported from ``runtime/preparation.ts``.

``sharp`` becomes Pillow and Poppler keeps the same two commands. The limits
are the contract: 50 MB input, 64 MB output, 512 MB workspace, 40 MP per page,
30 pages, and a 30 s kill on every subprocess. They are checked in the same
order as the Node file so a hostile document fails with the same code.

Images are re-encoded at quality 85 inside a 2048 px box, EXIF-rotated and
flattened onto white — the reader sees the same pixels it saw under sharp.
"""

from __future__ import annotations

import asyncio
import io
import math
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any, Mapping

from PIL import Image, ImageOps

from .db.jobs import JobError
from .workspace import workspace_root

INPUT_BYTES = 50 * 1024 * 1024
OUTPUT_BYTES = 64 * 1024 * 1024
WORKSPACE_BYTES = 512 * 1024 * 1024
PIXELS = 40_000_000
SAFE_INTEGER = 2**53 - 1
TIMEOUT_SECONDS = 30
MAX_BUFFER = 1024 * 1024

_PAGES = re.compile(r"^Pages:\s+(\d+)\s*$", re.MULTILINE)
_ENCRYPTED = re.compile(r"^Encrypted:\s+no\s*$", re.MULTILINE)
_PAGE_SIZE = re.compile(r"^Page size:\s+([\d.]+) x ([\d.]+) pts", re.MULTILINE)

SUPPORTED_MIME = (
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
)


def _bounded(value: Any, fallback: int) -> int:
    effective = fallback if value is None else value
    if (
        isinstance(effective, bool)
        or not isinstance(effective, int)
        or effective < 1
        or effective > fallback
        or effective > SAFE_INTEGER
    ):
        raise JobError("document_limit_invalid")
    return effective


async def _process_document(binary: str, arguments: list[str]) -> str:
    process = await asyncio.create_subprocess_exec(
        binary,
        *arguments,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        stdout, _ = await asyncio.wait_for(
            process.communicate(), timeout=TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise JobError("document_process_failed") from None
    # Do not retain stderr/file paths or document text in error messages.
    if process.returncode != 0 or len(stdout) > MAX_BUFFER:
        raise JobError("document_process_failed")
    return stdout.decode("utf-8", "replace")


def _pdf_pages(info: str, max_pages: int) -> int:
    match = _PAGES.search(info)
    pages = int(match.group(1)) if match else None
    if not _ENCRYPTED.search(info):
        raise JobError("document_encrypted_or_invalid")
    if pages is None or pages < 1 or pages > max_pages:
        raise JobError("document_page_limit")
    return pages


def _assert_pdf_pixels(info: str, page: int, max_pixels: int) -> None:
    match = re.compile(
        rf"^Page\s+{page}\s+size:\s+([\d.]+) x ([\d.]+) pts", re.MULTILINE
    ).search(info) or _PAGE_SIZE.search(info)
    if not match:
        raise JobError("document_page_size_invalid")
    width = float(match.group(1))
    height = float(match.group(2))
    # Pixel policy at the rendering resolution, before invoking the renderer.
    if (
        not (width > 0 and height > 0)
        or math.ceil(width * 2) * math.ceil(height * 2) > max_pixels
    ):
        raise JobError("document_pixel_limit")


def _encode_image(
    content: bytes,
    max_pixels: int,
    expected_mime: str | None = None,
) -> tuple[bytes, int, int]:
    try:
        with Image.open(io.BytesIO(content)) as opened:
            width, height = opened.size
            if not width or not height or width * height > max_pixels:
                raise JobError("document_pixel_limit")
            if getattr(opened, "n_frames", 1) > 1:
                raise JobError("document_multiframe_unsupported")
            if expected_mime and f"image/{(opened.format or '').lower()}" != (
                expected_mime
            ):
                raise JobError("document_mime_mismatch")
            image = ImageOps.exif_transpose(opened) or opened
            if "A" in image.getbands():
                background = Image.new("RGB", image.size, (255, 255, 255))
                background.paste(image, mask=image.getchannel("A"))
                image = background
            else:
                image = image.convert("RGB")
            scale = min(1.0, 2048 / width, 2048 / height)
            target = (
                max(1, round(width * scale)),
                max(1, round(height * scale)),
            )
            if target != image.size:
                image = image.resize(target, Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, "JPEG", quality=85)
            return output.getvalue(), image.size[0], image.size[1]
    except (OSError, ValueError):
        raise JobError("document_process_failed") from None


def _write_private(path: Path, content: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(descriptor, content)
    finally:
        os.close(descriptor)


async def prepare_document(
    data: bytes,
    mime: str,
    root: Path,
    limits: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    options = limits or {}
    max_pages = _bounded(options.get("max_pages"), 30)
    max_pixels = _bounded(options.get("max_pixels"), PIXELS)
    max_workspace_bytes = _bounded(
        options.get("max_workspace_bytes"), WORKSPACE_BYTES
    )
    if not data or len(data) > INPUT_BYTES:
        raise JobError("document_input_limit")
    if len(data) > max_workspace_bytes:
        raise JobError("workspace_limit")
    if mime not in SUPPORTED_MIME:
        raise JobError("unsupported_document")
    workspace_root(root)
    directory = Path(tempfile.mkdtemp(prefix="assessment-", dir=root))
    os.chmod(directory, 0o700)
    pages: list[dict[str, Any]] = []
    output_bytes = 0

    async def convert(
        content: bytes,
        page_number: int,
        expected_mime: str | None = None,
    ) -> None:
        nonlocal output_bytes
        encoded, width, height = await asyncio.to_thread(
            _encode_image, content, max_pixels, expected_mime
        )
        output_bytes += len(encoded)
        if output_bytes > OUTPUT_BYTES:
            raise JobError("document_output_limit")
        if len(data) + output_bytes > max_workspace_bytes:
            raise JobError("workspace_limit")
        pages.append(
            {
                "bytes": encoded,
                "mime": "image/jpeg",
                "width": width,
                "height": height,
                "pageNumber": page_number,
            }
        )

    try:
        if mime != "application/pdf":
            await convert(data, 1, mime)
            return pages
        if data[:5] != b"%PDF-":
            raise JobError("document_mime_mismatch")
        source = directory / "input.pdf"
        _write_private(source, data)
        count = _pdf_pages(
            await _process_document("pdfinfo", [str(source)]), max_pages
        )
        for page in range(1, count + 1):
            info = await _process_document(
                "pdfinfo",
                ["-f", str(page), "-l", str(page), "-box", str(source)],
            )
            _assert_pdf_pixels(info, page, max_pixels)
            prefix = directory / "page"
            rendered = Path(f"{prefix}.jpg")
            # Pre-create with private permissions before Poppler opens/truncates it.
            descriptor = os.open(
                rendered, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
            )
            os.close(descriptor)
            await _process_document(
                "pdftoppm",
                [
                    "-f",
                    str(page),
                    "-l",
                    str(page),
                    "-singlefile",
                    "-r",
                    "144",
                    "-scale-to",
                    "2048",
                    "-jpeg",
                    "-jpegopt",
                    "quality=85",
                    str(source),
                    str(prefix),
                ],
            )
            os.chmod(rendered, 0o600)
            size = rendered.stat().st_size
            if (
                size + len(data) + output_bytes > max_workspace_bytes
                or size > OUTPUT_BYTES - output_bytes
            ):
                raise JobError("workspace_limit")
            content = await asyncio.to_thread(rendered.read_bytes)
            await convert(content, page, "image/jpeg")
            os.unlink(rendered)
        return pages
    finally:
        await asyncio.to_thread(shutil.rmtree, directory, True)
