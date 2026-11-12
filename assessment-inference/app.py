"""Internal, stateless AI inference for the assessment worker."""

import asyncio
import os
import re
from urllib.parse import urlsplit
from contextlib import asynccontextmanager
from hmac import compare_digest
from typing import Annotated, Literal

from exam_import import DOCX_LIMIT, ExamImportError, parse_exam

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError

REQUEST_LIMIT = 24 * 1024 * 1024
RESPONSE_LIMIT = 2 * 1024 * 1024
Provider = Literal["google", "deepseek"]
CredentialRef = Annotated[str, Field(pattern=r"^[A-Z][A-Z0-9_]*$")]


class InternalPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Image(InternalPayload):
    mime: Literal["image/jpeg", "image/png", "image/webp"]
    data: Annotated[str, Field(min_length=1, max_length=REQUEST_LIMIT)]


class Credential(InternalPayload):
    provider: Provider
    credentialRef: CredentialRef


class Generate(Credential):
    dialect: Literal["google_generate_content", "openai_chat_completions"]
    model: Annotated[str, Field(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9._-]*$", max_length=100)]
    reasoningPolicy: Literal["disabled", "low", "provider_default"]
    maxOutputTokens: Annotated[int, Field(ge=256, le=8192)]
    instruction: Annotated[str, Field(max_length=262144)]
    inputJson: Annotated[str, Field(max_length=262144)]
    images: Annotated[list[Image], Field(max_length=2)]


class LocalGenerate(InternalPayload):
    maxOutputTokens: Annotated[int, Field(ge=256, le=8192)]
    instruction: Annotated[str, Field(max_length=262144)]
    inputJson: Annotated[str, Field(max_length=262144)]
    images: Annotated[list[Image], Field(max_length=2)]


def local_model_config():
    try:
        url = urlsplit(os.environ.get("ASSESSMENT_LOCAL_MODEL_URL", ""))
        port = url.port
    except ValueError:
        raise HTTPException(503, "local_model_unavailable") from None
    model = os.environ.get("ASSESSMENT_LOCAL_MODEL_NAME", "")
    # Network policy restricts the runtime further. The application accepts only
    # a Compose service alias or loopback and never a caller-supplied destination.
    if (
        url.scheme != "http" or url.hostname not in {"assessment-local-model", "127.0.0.1"}
        or not port or url.username or url.password or url.query or url.fragment
        or url.path not in {"", "/"}
        or not re.fullmatch(r"[a-zA-Z0-9._:/-]{1,160}", model)
    ):
        raise HTTPException(503, "local_model_unavailable")
    return f"http://{url.hostname}:{port}/v1/chat/completions", model


class Readiness(InternalPayload):
    credentials: Annotated[list[Credential], Field(min_length=1, max_length=64)]


class ImportExam(InternalPayload):
    data: Annotated[str, Field(min_length=1, max_length=4 * ((DOCX_LIMIT + 2) // 3))]
    examCode: Annotated[str, Field(min_length=1, max_length=50)]
    maxScoreUnits: Annotated[int, Field(ge=1, le=1000000)]


async def read_payload(request: Request, model: type[BaseModel], limit: int):
    length = request.headers.get("content-length")
    if length is not None and (not length.isdecimal() or int(length) > limit):
        raise HTTPException(413, "inference_request_limit")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > limit:
            raise HTTPException(413, "inference_request_limit")
        body.extend(chunk)
    try:
        return model.model_validate_json(body)
    except ValidationError:
        raise HTTPException(422, "inference_request_invalid") from None


def provider_key(credential: Credential) -> str:
    ref = credential.credentialRef
    prefix = f"ASSESSMENT_{credential.provider.upper()}_"
    native = ref.endswith("_API_KEY") and ref.startswith(prefix)
    reserved = (
        ref == "ASSESSMENT_INFERENCE_TOKEN"
        or ref.endswith("_CREDENTIAL_REFS")
        or (
            ref.endswith("_API_KEY")
            and ref.startswith(("ASSESSMENT_GOOGLE_", "ASSESSMENT_DEEPSEEK_"))
            and not native
        )
    )
    legacy_refs = os.environ.get(f"{prefix}CREDENTIAL_REFS", "")
    if reserved or (not native and ref not in legacy_refs.split(",")):
        raise HTTPException(422, "inference_request_invalid")
    key = os.environ.get(ref)
    if not key:
        raise HTTPException(503, "provider_credentials_required")
    return key


def provider_request(request: Generate, key: str):
    if request.provider == "google" and request.dialect == "google_generate_content":
        config = {
            "responseMimeType": "application/json",
            "maxOutputTokens": request.maxOutputTokens,
        }
        if request.reasoningPolicy == "disabled" and request.model.startswith("gemini-2.5-flash"):
            config["thinkingConfig"] = {"thinkingBudget": 0}
        if request.reasoningPolicy == "low":
            if not request.model.startswith("gemini-3"):
                raise HTTPException(422, "reasoning_policy_unsupported")
            config["thinkingConfig"] = {"thinkingLevel": "low"}
        parts = [{"text": request.inputJson}]
        parts.extend(
            {"inlineData": {"mimeType": image.mime, "data": image.data}}
            for image in request.images
        )
        return (
            f"https://generativelanguage.googleapis.com/v1beta/models/{request.model}:generateContent",
            {"x-goog-api-key": key},
            {
                "systemInstruction": {"parts": [{"text": request.instruction}]},
                "contents": [{"role": "user", "parts": parts}],
                "generationConfig": config,
            },
        )
    if request.provider == "deepseek" and request.dialect == "openai_chat_completions":
        content = request.inputJson
        if request.images:
            content = [{"type": "text", "text": request.inputJson}]
            content.extend(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{image.mime};base64,{image.data}"},
                }
                for image in request.images
            )
        body = {
            "model": request.model,
            "messages": [
                {"role": "system", "content": request.instruction},
                {"role": "user", "content": content},
            ],
            "max_tokens": request.maxOutputTokens,
            "response_format": {"type": "json_object"},
        }
        if request.reasoningPolicy == "disabled":
            body["thinking"] = {"type": "disabled"}
        return (
            "https://api.deepseek.com/chat/completions",
            {"Authorization": f"Bearer {key}"},
            body,
        )
    raise HTTPException(422, "provider_dialect_invalid")


def create_app(transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        token = os.environ.get("ASSESSMENT_INFERENCE_TOKEN", "")
        if len(token) < 32 or not token.isascii() or not token.isalnum():
            raise RuntimeError("assessment_inference_token_invalid")
        app.state.authorization = f"Bearer {token}".encode()
        app.state.slots = asyncio.Semaphore(2)
        async with httpx.AsyncClient(
            transport=transport,
            follow_redirects=False,
            trust_env=False,
            timeout=httpx.Timeout(90.0, connect=8.0),
        ) as provider:
            app.state.provider = provider
            yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    def authorize(request: Request):
        supplied = request.headers.get("authorization", "").encode()
        if not compare_digest(supplied, request.app.state.authorization):
            raise HTTPException(401, "inference_unauthorized")

    @app.get("/healthz", status_code=204)
    async def health():
        return Response(status_code=204)

    @app.post("/v1/readiness", status_code=204)
    async def readiness(request: Request):
        authorize(request)
        if os.environ.get("ASSESSMENT_INFERENCE_MODE") != "synthetic":
            raise HTTPException(403, "public_inference_disabled")
        payload = await read_payload(request, Readiness, 8192)
        for credential in payload.credentials:
            provider_key(credential)
        return Response(status_code=204)

    @app.post("/v1/import-exam")
    async def import_exam(request: Request):
        authorize(request)
        payload = await read_payload(request, ImportExam, 4 * ((DOCX_LIMIT + 2) // 3) + 1024)
        slots = request.app.state.slots
        if slots.locked():
            raise HTTPException(503, "inference_busy")
        async with slots:
            try:
                return await asyncio.to_thread(
                    parse_exam, payload.data, payload.examCode, payload.maxScoreUnits
                )
            except ExamImportError as error:
                raise HTTPException(422, str(error)) from None

    @app.post("/v1/generate")
    async def generate(request: Request):
        authorize(request)
        if os.environ.get("ASSESSMENT_INFERENCE_MODE") != "synthetic":
            raise HTTPException(403, "public_inference_disabled")
        payload = await read_payload(request, Generate, REQUEST_LIMIT)
        key = provider_key(payload)
        url, headers, body = provider_request(payload, key)
        return await generate_response(request, url, headers, body)

    @app.get("/v1/local-readiness", status_code=204)
    async def local_readiness(request: Request):
        authorize(request)
        local_model_config()
        return Response(status_code=204)

    @app.post("/v1/generate-local")
    async def generate_local(request: Request):
        authorize(request)
        payload = await read_payload(request, LocalGenerate, REQUEST_LIMIT)
        url, model = local_model_config()
        token = os.environ.get("ASSESSMENT_LOCAL_MODEL_TOKEN", "")
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        content = [{"type": "text", "text": payload.inputJson}]
        content.extend(
            {"type": "image_url", "image_url": {"url": f"data:{image.mime};base64,{image.data}"}}
            for image in payload.images
        )
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": payload.instruction},
                {"role": "user", "content": content if payload.images else payload.inputJson},
            ],
            "max_tokens": payload.maxOutputTokens,
            "response_format": {"type": "json_object"},
        }
        return await generate_response(request, url, headers, body)

    async def generate_response(request: Request, url: str, headers: dict, body: dict):
        slots = request.app.state.slots
        if slots.locked():
            raise HTTPException(503, "inference_busy")
        async with slots:
            try:
                async with asyncio.timeout(90):
                    async with request.app.state.provider.stream(
                        "POST", url, headers=headers, json=body
                    ) as response:
                        if response.is_redirect:
                            raise HTTPException(502, "provider_redirect_denied")
                        if not response.is_success:
                            raise HTTPException(
                                response.status_code, f"provider_http_{response.status_code}"
                            )
                        output = bytearray()
                        async for chunk in response.aiter_bytes(chunk_size=65536):
                            if len(output) + len(chunk) > RESPONSE_LIMIT:
                                raise HTTPException(502, "provider_response_limit")
                            output.extend(chunk)
            except (TimeoutError, httpx.TimeoutException):
                raise HTTPException(504, "provider_timeout") from None
            except httpx.RequestError:
                raise HTTPException(502, "provider_unavailable") from None
        return Response(bytes(output), media_type="application/json")

    return app


app = create_app()
