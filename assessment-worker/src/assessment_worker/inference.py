"""HTTP client for the ``assessment-inference`` sidecar (``runtime/inference.ts``).

The provider credentials live in the sidecar's own env file
(``docs/assessment/operations-runbook.md``); this worker never holds them, so
every model call is one HTTP hop, exactly like the Node worker.

``InferenceRejected`` marks a request that was refused before reaching the
provider. ``provider.ts`` records those as ``not_sent`` with zero cost, so the
class is load-bearing for billing, not just for control flow.
"""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from typing import Any, Mapping, Sequence
from urllib.parse import urlsplit

import httpx

from .canonical import stringify
from .db.jobs import JobError
from .routing import assert_provider_dialect

RESPONSE_LIMIT = 2 * 1024 * 1024
TOKEN = re.compile(r"^[a-zA-Z0-9]{32,}$")
EXAM_IMPORT_FAILURE = re.compile(r"^exam_import_[a-z_]+$")

PREFLIGHT_ERRORS = frozenset(
    {
        "inference_busy",
        "inference_unauthorized",
        "inference_request_limit",
        "inference_request_invalid",
        "provider_credentials_required",
        "provider_dialect_invalid",
        "reasoning_policy_unsupported",
        "local_model_unavailable",
    }
)

UPSTREAM_ERRORS = frozenset(
    {
        "provider_timeout",
        "provider_unavailable",
        "provider_redirect_denied",
        "provider_response_limit",
    }
)


class InferenceRejected(RuntimeError):
    """The sidecar refused the request before any provider call."""


@dataclass(frozen=True)
class InferenceConfig:
    url: str
    token: str


def inference_config(
    env: Mapping[str, str] | None = None,
) -> InferenceConfig:
    import os

    values = env if env is not None else os.environ
    raw = values.get("ASSESSMENT_INFERENCE_URL") or ""
    token = values.get("ASSESSMENT_INFERENCE_TOKEN") or ""
    parts = urlsplit(raw)
    if (
        not raw
        or parts.scheme not in ("http", "https")
        or parts.hostname not in ("assessment-inference", "127.0.0.1")
        or parts.path not in ("", "/")
        or parts.username
        or parts.password
        or parts.query
        or parts.fragment
        or not TOKEN.fullmatch(token)
    ):
        raise JobError("inference_configuration_required")
    return InferenceConfig(
        url=f"{parts.scheme}://{parts.netloc}", token=token
    )


async def read_bounded_response(response: httpx.Response) -> str:
    chunks: list[bytes] = []
    size = 0
    async for chunk in response.aiter_bytes():
        size += len(chunk)
        if size > RESPONSE_LIMIT:
            raise JobError("provider_response_limit")
        chunks.append(chunk)
    return b"".join(chunks).decode("utf-8")


def _images(images: Sequence[Mapping[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "mime": image["mime"],
            "data": base64.b64encode(image["bytes"]).decode("ascii"),
        }
        for image in images
    ]


async def _post(
    config: InferenceConfig,
    path: str,
    body: Mapping[str, Any],
    timeout_ms: int,
) -> str:
    timeout = httpx.Timeout(timeout_ms / 1000)
    try:
        async with httpx.AsyncClient(
            follow_redirects=False, timeout=timeout
        ) as client:
            async with client.stream(
                "POST",
                f"{config.url}{path}",
                json=body,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {config.token}",
                },
            ) as response:
                if response.is_success:
                    return await read_bounded_response(response)
                status = response.status_code
                try:
                    detail = json.loads(await read_bounded_response(response)).get(
                        "detail"
                    )
                except Exception:
                    raise JobError("inference_unavailable") from None
    except httpx.TimeoutException:
        raise JobError("inference_timeout") from None
    except httpx.HTTPError:
        raise JobError("inference_unavailable") from None
    if isinstance(detail, str):
        if (
            path == "/v1/import-exam"
            and status == 422
            and EXAM_IMPORT_FAILURE.fullmatch(detail)
        ):
            raise JobError(detail)
        if detail in PREFLIGHT_ERRORS:
            raise InferenceRejected(detail)
        if detail in UPSTREAM_ERRORS or detail == f"provider_http_{status}":
            raise JobError(detail)
    raise JobError("inference_unavailable")


async def check_inference() -> None:
    config = inference_config()
    try:
        async with httpx.AsyncClient(
            follow_redirects=False, timeout=httpx.Timeout(5.0)
        ) as client:
            response = await client.get(f"{config.url}/healthz")
    except httpx.HTTPError:
        raise JobError("inference_unavailable") from None
    if response.status_code != 204:
        raise JobError("inference_unavailable")


async def run_local_inference(
    instruction: str,
    input: Any,
    images: Sequence[Mapping[str, Any]] = (),
) -> Any:
    text = await _post(
        inference_config(),
        "/v1/generate-local",
        {
            "maxOutputTokens": 8192,
            "instruction": instruction,
            "inputJson": stringify(input),
            "images": _images(images),
        },
        95000,
    )
    try:
        decoded = json.loads(text)
        choice = decoded["choices"][0]
        message = choice["message"]
        if (
            choice.get("finish_reason") != "stop"
            or message.get("refusal")
            or not isinstance(message.get("content"), str)
        ):
            raise ValueError
        return json.loads(message["content"])
    except Exception:
        raise JobError("local_model_output_invalid") from None


async def run_inference(
    config: InferenceConfig,
    profile: Mapping[str, Any],
    instruction: str,
    input: Any,
    images: Sequence[Mapping[str, Any]] = (),
) -> Any:
    assert_provider_dialect(profile)
    if images and "vision" not in profile.get("capabilities", ()):
        raise InferenceRejected("vision_required")
    text = await _post(
        config,
        "/v1/generate",
        {
            "provider": profile["provider"],
            "dialect": profile["apiDialect"],
            "model": profile["model"],
            "credentialRef": profile["credentialRef"],
            "reasoningPolicy": profile["reasoningPolicy"],
            "maxOutputTokens": profile["maxOutputTokens"],
            "instruction": instruction,
            "inputJson": stringify(input),
            "images": _images(images),
        },
        95000,
    )
    try:
        return json.loads(text)
    except ValueError:
        raise JobError("provider_json_invalid") from None
