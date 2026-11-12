import hashlib
import hmac
import json
import os
import time
import unittest
import uuid
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from external_grading import create_app

TOKEN = "t" * 32
KEY = "k" * 48
POLICY = "pilot-v1"
BODY = {
    "answer": "Thép có độ bền cao và dễ gia công.",
    "criteria": [{
        "id": "c1", "description": "Nêu được tính chất của thép.", "allowedUnits": [0, 250],
    }],
}
OUTPUT = {"criteria": [{"id": "c1", "earnedUnits": 250, "reason": "Đã nêu tính chất."}]}


class ExternalGradingTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.output = OUTPUT
        self.enterContext(patch.dict(os.environ, {
            "ASSESSMENT_EXTERNAL_GRADING_ENABLED": "true",
            "ASSESSMENT_EXTERNAL_GRADING_TOKEN": TOKEN,
            "ASSESSMENT_EXTERNAL_GRADING_SIGNING_KEY": KEY,
            "ASSESSMENT_EXTERNAL_GRADING_POLICY": POLICY,
            "ASSESSMENT_EXTERNAL_GRADING_PROVIDER": "deepseek",
            "ASSESSMENT_EXTERNAL_GRADING_MODEL": "deepseek-chat",
            "ASSESSMENT_EXTERNAL_GRADING_API_KEY": "test-upstream-secret",
        }))
        self.client = self.enterContext(TestClient(create_app(httpx.MockTransport(self.provider))))

    def provider(self, request):
        self.calls.append(request)
        if request.url.host == "generativelanguage.googleapis.com":
            return httpx.Response(200, json={
                "candidates": [{
                    "finishReason": "STOP",
                    "content": {"parts": [{"text": json.dumps(self.output)}]},
                }],
            })
        return httpx.Response(200, json={
            "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(self.output)}}],
        })

    def signed(self, body, expiry=None):
        expiry = str(expiry if expiry is not None else int(time.time()) + 30)
        nonce = str(uuid.uuid4())
        digest = hashlib.sha256(body).hexdigest()
        message = f"{POLICY}.{expiry}.{nonce}.{digest}".encode()
        return {
            "Authorization": f"Bearer {TOKEN}",
            "X-Assessment-Policy": POLICY,
            "X-Assessment-Expires": expiry,
            "X-Assessment-Nonce": nonce,
            "X-Assessment-Signature": hmac.new(KEY.encode(), message, hashlib.sha256).hexdigest(),
        }

    def test_only_minimal_text_reaches_provider_and_replay_is_blocked(self):
        body = json.dumps(BODY).encode()
        headers = self.signed(body)
        res = self.client.post("/v1/grade-text", content=body, headers=headers)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(res.json(), OUTPUT)
        self.assertEqual(len(self.calls), 1)
        outbound = self.calls[0]
        self.assertEqual(outbound.url.host, "api.deepseek.com")
        self.assertEqual(outbound.headers["authorization"], "Bearer test-upstream-secret")
        self.assertNotIn("X-Assessment-Nonce", outbound.headers)
        messages = json.loads(outbound.content)["messages"]
        self.assertEqual(json.loads(messages[1]["content"]), BODY)
        res = self.client.post("/v1/grade-text", content=body, headers=headers)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(len(self.calls), 1)

    def test_google_request_contains_only_text_and_its_own_credential(self):
        body = json.dumps(BODY).encode()
        with patch.dict(os.environ, {
            "ASSESSMENT_EXTERNAL_GRADING_PROVIDER": "google",
            "ASSESSMENT_EXTERNAL_GRADING_MODEL": "gemini-2.5-flash",
        }):
            res = self.client.post("/v1/grade-text", content=body, headers=self.signed(body))
        self.assertEqual(res.status_code, 200, res.text)
        request = self.calls[0]
        self.assertEqual(request.url.host, "generativelanguage.googleapis.com")
        self.assertEqual(request.headers["x-goog-api-key"], "test-upstream-secret")
        self.assertNotIn("Authorization", request.headers)
        self.assertEqual(
            json.loads(request.content)["contents"],
            [{"role": "user", "parts": [{"text": json.dumps(BODY, ensure_ascii=False, separators=(",", ":"))}]}],
        )

    def test_malformed_or_identifiable_content_never_reaches_provider(self):
        for payload in (
            {**BODY, "images": []},
            {**BODY, "answer": "Em tên là Nguyễn Văn A."},
            {**BODY, "answer": "https://example.org"},
            {**BODY, "answer": "Đọc thêm tại example.org/bai-lam"},
            {**BODY, "answer": "Gửi vào a@example.org"},
            {**BODY, "answer": "Điện thoại 0901 234 567"},
            {**BODY, "criteria": [{**BODY["criteria"][0], "description": "Mã học sinh: 123"}]},
        ):
            with self.subTest(payload=payload):
                body = json.dumps(payload).encode()
                res = self.client.post("/v1/grade-text", content=body, headers=self.signed(body))
                self.assertEqual(res.status_code, 422)
        self.assertEqual(self.calls, [])

    def test_disabled_tampered_expired_and_legacy_routes_never_call_provider(self):
        body = json.dumps(BODY).encode()
        headers = self.signed(body)
        with patch.dict(os.environ, {"ASSESSMENT_EXTERNAL_GRADING_ENABLED": "false"}):
            self.assertEqual(self.client.post("/v1/grade-text", content=body, headers=headers).status_code, 503)
        for sent, signature in (
            (body + b" ", headers),
            (body, self.signed(body, int(time.time()) - 1)),
            (body, self.signed(body, int(time.time()) + 120)),
            (body, {**headers, "Authorization": "Bearer wrong"}),
        ):
            self.assertEqual(self.client.post("/v1/grade-text", content=sent, headers=signature).status_code, 401)
        self.assertEqual(self.client.post("/v1/generate", content=body, headers=headers).status_code, 404)
        self.assertEqual(self.calls, [])

    def test_invalid_provider_output_is_sanitized(self):
        body = json.dumps(BODY).encode()
        self.output = {"criteria": [{"id": "c1", "earnedUnits": 999, "reason": "Secret raw text"}]}
        res = self.client.post("/v1/grade-text", content=body, headers=self.signed(body))
        self.assertEqual(res.status_code, 502)
        self.assertNotIn("Secret raw text", res.text)
        self.assertEqual(len(self.calls), 1)
