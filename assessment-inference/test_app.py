import json
import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app import create_app
from test_exam_import import fixture


TOKEN = "x" * 32
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
GOOGLE_KEY = "ASSESSMENT_GOOGLE_API_KEY"
DEEPSEEK_KEY = "ASSESSMENT_DEEPSEEK_API_KEY"
PAYLOAD = {
    "provider": "google",
    "dialect": "google_generate_content",
    "model": "gemini-2.5-flash",
    "credentialRef": GOOGLE_KEY,
    "reasoningPolicy": "disabled",
    "maxOutputTokens": 4096,
    "instruction": "Read marks",
    "inputJson": '{"pageNumber":1}',
    "images": [{"mime": "image/jpeg", "data": "eA=="}],
}


class AssessmentInferenceTest(unittest.TestCase):
    def setUp(self):
        self.requests = []
        self.upstream = httpx.Response(200, json={"candidates": []})

        def provider(request):
            self.requests.append(request)
            return self.upstream

        self.enterContext(patch.dict(os.environ, {
            "ASSESSMENT_INFERENCE_TOKEN": TOKEN,
            "ASSESSMENT_INFERENCE_MODE": "synthetic",
            GOOGLE_KEY: "google-test",
            DEEPSEEK_KEY: "deepseek-test",
        }))
        self.client = self.enterContext(TestClient(
            create_app(httpx.MockTransport(provider))
        ))

    def test_requires_internal_token(self):
        response = self.client.post("/v1/generate", json=PAYLOAD)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.requests, [])

    def test_private_mode_blocks_public_route_and_uses_only_configured_local_model(self):
        with patch.dict(os.environ, {
            "ASSESSMENT_INFERENCE_MODE": "local",
            "ASSESSMENT_LOCAL_MODEL_URL": "http://assessment-local-model:8000",
            "ASSESSMENT_LOCAL_MODEL_NAME": "private-model",
        }):
            self.assertEqual(self.client.post("/v1/generate", headers=HEADERS, json=PAYLOAD).status_code, 403)
            self.assertEqual(self.requests, [])
            response = self.client.post("/v1/generate-local", headers=HEADERS, json={
                "instruction": "Read locally", "inputJson": "{}", "images": PAYLOAD["images"],
                "maxOutputTokens": 512,
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(str(self.requests[0].url), "http://assessment-local-model:8000/v1/chat/completions")
            self.assertEqual(json.loads(self.requests[0].content)["model"], "private-model")

    def test_imports_word_without_provider_calls(self):
        payload = {"data": fixture(), "examCode": "102", "maxScoreUnits": 2250}
        self.assertEqual(self.client.post("/v1/import-exam", json=payload).status_code, 401)
        result = self.client.post("/v1/import-exam", headers=HEADERS, json=payload)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()["document"]["questions"][0]["answerKey"], "A")
        self.assertEqual(self.requests, [])

    def test_checks_credential_names_without_calling_providers(self):
        response = self.client.post("/v1/readiness", headers=HEADERS, json={
            "credentials": [
                {"provider": "google", "credentialRef": GOOGLE_KEY},
                {"provider": "deepseek", "credentialRef": DEEPSEEK_KEY},
            ],
        })
        self.assertEqual(response.status_code, 204)
        response = self.client.post("/v1/readiness", headers=HEADERS, json={
            "credentials": [
                {"provider": "google", "credentialRef": "ASSESSMENT_INFERENCE_TOKEN"},
            ],
        })
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.requests, [])

    def test_allows_legacy_routing_refs_only_for_the_configured_provider(self):
        with patch.dict(os.environ, {
            "ASSESSMENT_GOOGLE_CREDENTIAL_REFS": "GEMINI_API_KEY,ASSESSMENT_INFERENCE_TOKEN",
            "GEMINI_API_KEY": "legacy-test",
        }):
            for ref, provider, status in (
                ("GEMINI_API_KEY", "google", 204),
                ("GEMINI_API_KEY", "deepseek", 422),
                ("ASSESSMENT_INFERENCE_TOKEN", "google", 422),
            ):
                response = self.client.post("/v1/readiness", headers=HEADERS, json={
                    "credentials": [{"provider": provider, "credentialRef": ref}],
                })
                self.assertEqual(response.status_code, status)
            response = self.client.post("/v1/generate", headers=HEADERS, json={
                **PAYLOAD, "credentialRef": "GEMINI_API_KEY",
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.requests[0].headers["x-goog-api-key"], "legacy-test")

    def test_gemini_receives_native_image_parts_and_key_only_in_header(self):
        result = self.client.post("/v1/generate", headers=HEADERS, json=PAYLOAD)
        self.assertEqual(result.json(), {"candidates": []})
        self.assertEqual(len(self.requests), 1)
        request = self.requests[0]
        self.assertEqual(request.url.host, "generativelanguage.googleapis.com")
        self.assertNotIn("google-test", str(request.url))
        self.assertEqual(request.headers["x-goog-api-key"], "google-test")
        body = json.loads(request.content)
        self.assertEqual(body["contents"][0]["parts"], [
            {"text": '{"pageNumber":1}'},
            {"inlineData": {"mimeType": "image/jpeg", "data": "eA=="}},
        ])
        self.assertEqual(body["generationConfig"]["thinkingConfig"], {"thinkingBudget": 0})

    def test_deepseek_uses_chat_payload_and_its_own_credentials(self):
        result = self.client.post("/v1/generate", headers=HEADERS, json={
            **PAYLOAD, "provider": "deepseek", "dialect": "openai_chat_completions",
            "model": "deepseek-flash", "credentialRef": DEEPSEEK_KEY,
        })
        self.assertEqual(result.status_code, 200)
        request = self.requests[0]
        self.assertEqual(str(request.url), "https://api.deepseek.com/chat/completions")
        self.assertEqual(request.headers["authorization"], "Bearer deepseek-test")
        body = json.loads(request.content)
        self.assertEqual(body["messages"][1]["content"][1]["image_url"]["url"],
                         "data:image/jpeg;base64,eA==")

    def test_rejects_caller_urls_and_mismatched_provider(self):
        for payload in (
            {**PAYLOAD, "url": "https://external.example"},
            {**PAYLOAD, "provider": "deepseek"},
            {**PAYLOAD, "credentialRef": DEEPSEEK_KEY},
        ):
            self.assertEqual(self.client.post(
                "/v1/generate", headers=HEADERS, json=payload,
            ).status_code, 422)
        self.assertEqual(self.requests, [])

    def test_returns_only_sanitized_errors(self):
        self.upstream = httpx.Response(429, text="private upstream error")
        result = self.client.post("/v1/generate", headers=HEADERS, json=PAYLOAD)
        self.assertEqual(result.status_code, 429)
        self.assertEqual(result.json(), {"detail": "provider_http_429"})
        self.upstream = httpx.Response(200, content=b"x" * (2 * 1024 * 1024 + 1))
        result = self.client.post("/v1/generate", headers=HEADERS, json=PAYLOAD)
        self.assertEqual(result.json(), {"detail": "provider_response_limit"})

    def test_rejects_large_requests_before_contacting_provider(self):
        response = self.client.post("/v1/generate", headers=HEADERS, content=b"x" * (24 * 1024 * 1024 + 1))
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.requests, [])
