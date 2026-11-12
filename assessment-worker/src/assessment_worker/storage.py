"""S3 object storage, ported from ``runtime/storage.ts``.

Every call is wrapped in ``asyncio.to_thread``: boto3 is synchronous and the
claim loop must keep heartbeating while a 50 MB object is being read.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import zipfile
import os
import re
import uuid
from typing import Any, Mapping

import boto3
from botocore.config import Config

from .db.jobs import JobError

_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_PDF_MAGIC = b"%PDF-"
_JPEG_MAGIC = b"\xff\xd8\xff"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_CHUNK = 1024 * 1024


def storage_key(
    school: str, assessment: str, asset: str, zone: str
) -> str:
    if zone not in ("staging", "sealed"):
        raise JobError("invalid_object_scope")
    if not all(_UUID.match(value or "") for value in (school, assessment, asset)):
        raise JobError("invalid_object_scope")
    return f"assessment/{school}/{assessment}/{zone}/{asset}"


def detect_document_mime(data: bytes) -> str:
    if data[:5] == _PDF_MAGIC:
        return "application/pdf"
    if data[:3] == _JPEG_MAGIC:
        return "image/jpeg"
    if data[:8] == _PNG_MAGIC:
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    raise JobError("unsupported_document")


class AssessmentStorage:
    def __init__(
        self,
        client: Any | None = None,
        bucket: str | None = None,
    ) -> None:
        self._client = client
        self._bucket = bucket

    @property
    def bucket(self) -> str:
        bucket = self._bucket or os.environ.get("ASSESSMENT_S3_BUCKET")
        if not bucket:
            raise JobError("assessment_storage_not_configured")
        return bucket

    def client(self) -> Any:
        if self._client is not None:
            return self._client
        endpoint = os.environ.get("ASSESSMENT_S3_ENDPOINT")
        if not endpoint or not endpoint.startswith("https://"):
            raise JobError("assessment_storage_https_required")
        access_key = os.environ.get("ASSESSMENT_S3_ACCESS_KEY_ID")
        secret_key = os.environ.get("ASSESSMENT_S3_SECRET_ACCESS_KEY")
        if not access_key or not secret_key:
            raise JobError("assessment_storage_credentials_required")
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=os.environ.get("ASSESSMENT_S3_REGION") or "us-east-1",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(
                # Same "one attempt" policy as the Node client: the lease, not
                # the SDK, decides whether a failure is retried.
                retries={"max_attempts": 1},
                connect_timeout=10,
                read_timeout=60,
                s3={"addressing_style": "path"}
                if os.environ.get("ASSESSMENT_S3_FORCE_PATH_STYLE") == "true"
                else {"addressing_style": "virtual"},
            ),
        )
        return self._client

    async def read(self, key: str, limit: int = 50 * 1024 * 1024) -> bytes:
        client = self.client()
        response = await asyncio.to_thread(
            client.get_object, Bucket=self.bucket, Key=key
        )
        body = response.get("Body")
        length = response.get("ContentLength") or 0
        if body is None or length > limit:
            raise JobError("document_size_invalid")
        chunks: list[bytes] = []
        size = 0
        try:
            while True:
                chunk = await asyncio.to_thread(body.read, _CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if size > limit:
                    raise JobError("document_size_invalid")
                chunks.append(chunk)
        finally:
            await asyncio.to_thread(body.close)
        return b"".join(chunks)

    async def put(self, key: str, data: bytes, mime: str) -> str | None:
        client = self.client()
        response = await asyncio.to_thread(
            client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=mime,
            CacheControl="private, no-store",
            ChecksumSHA256=base64.b64encode(hashlib.sha256(data).digest()).decode(),
        )
        return response.get("VersionId") or None

    async def seal(self, asset: Mapping[str, Any]) -> dict[str, Any]:
        """Verify the staged object, copy it to the sealed key, return the facts."""
        expected = storage_key(
            str(asset["school_id"]),
            str(asset["assessment_id"]),
            str(asset["id"]),
            "staging",
        )
        if asset["staging_key"] != expected:
            raise JobError("invalid_staging_key")
        byte_size = int(asset["byte_size"])
        data = await self.read(asset["staging_key"], byte_size)
        if len(data) != byte_size:
            raise JobError("document_size_mismatch")
        if asset["declared_mime"] == _DOCX_MIME and asset.get("purpose") == "marking_guide":
            if byte_size > 5 * 1024 * 1024:
                raise JobError("document_size_invalid")
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as package:
                    if not {"[Content_Types].xml", "word/document.xml"}.issubset(package.namelist()):
                        raise JobError("unsupported_document")
            except zipfile.BadZipFile:
                raise JobError("unsupported_document") from None
            verified_mime = _DOCX_MIME
        else:
            verified_mime = detect_document_mime(data)
        if verified_mime != asset["declared_mime"]:
            raise JobError("document_mime_mismatch")
        sha256 = hashlib.sha256(data).hexdigest()
        sealed_key = (
            f"{storage_key(str(asset['school_id']), str(asset['assessment_id']), str(asset['id']), 'sealed')}"
            f"/{sha256}"
        )
        storage_version_id = await self.put(sealed_key, data, verified_mime)
        return {
            "sha256": sha256,
            "sealedKey": sealed_key,
            "storageVersionId": storage_version_id,
            "verifiedMime": verified_mime,
        }

    async def ready(self) -> None:
        """Head the bucket, then write/read/delete a canary object."""
        key = f"assessment/readiness/{uuid.uuid4()}"
        data = os.urandom(32)
        version: str | None = None
        attempted_write = False

        def probe() -> None:
            nonlocal version, attempted_write
            client = self.client()
            bucket = self.bucket
            client.head_bucket(Bucket=bucket)
            attempted_write = True
            written = client.put_object(
                Bucket=bucket,
                Key=key,
                Body=data,
                ContentType="application/octet-stream",
                CacheControl="private, no-store",
            )
            version = written.get("VersionId") or None
            fetched = client.get_object(Bucket=bucket, Key=key, **({"VersionId": version} if version else {}))
            body = fetched.get("Body")
            if body is None:
                raise JobError("canary_invalid")
            payload = body.read(len(data) + 1)
            body.close()
            if payload != data:
                raise JobError("canary_invalid")

        def cleanup() -> None:
            if not attempted_write:
                return
            self.client().delete_object(
                Bucket=self.bucket,
                Key=key,
                **({"VersionId": version} if version else {}),
            )

        try:
            await asyncio.to_thread(probe)
        except Exception as error:
            raise JobError("storage_unreachable") from error
        finally:
            try:
                await asyncio.to_thread(cleanup)
            except Exception:
                # Best effort, exactly like the Node client: a leftover canary
                # must not turn a healthy bucket into a startup failure.
                pass
