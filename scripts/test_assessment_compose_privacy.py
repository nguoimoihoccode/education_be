"""Validate the rendered production Compose topology without starting containers."""

import json
import os
import subprocess
import unittest
from pathlib import Path


class AssessmentComposePrivacyTest(unittest.TestCase):
    @staticmethod
    def render(*profiles, policy=None):
        command = [
            "docker", "compose", "--env-file", os.devnull,
            "-f", "docker-compose.prod.yml",
        ]
        for profile in profiles:
            command.extend(["--profile", profile])
        command.extend(["config", "--no-env-resolution", "--format", "json"])
        return json.loads(subprocess.check_output(
            command,
            cwd=Path(__file__).resolve().parents[1],
            env={
                **{key: value for key, value in os.environ.items()
                   if not key.startswith(("ASSESSMENT_", "COMPOSE_"))},
                **(policy or {}),
            },
            stderr=subprocess.DEVNULL,
        ))

    def test_preview_and_normal_assessment_never_start_the_external_gateway(self):
        default = self.render()
        self.assertEqual(default["services"]["backend"]["environment"]["ASSESSMENT_ENABLED"], "false")
        self.assertNotIn("assessment-inference", default["services"])
        self.assertNotIn("assessment-external-grading", self.render("assessment")["services"])

    def test_external_policy_is_shared_without_gateway_credentials(self):
        policy = {
            "ASSESSMENT_EXTERNAL_GRADING_ENABLED": "true",
            "ASSESSMENT_EXTERNAL_GRADING_POLICY": "pilot-v1",
            "ASSESSMENT_EXTERNAL_GRADING_ASSESSMENT_IDS": "00000000-0000-4000-8000-000000000001",
        }
        services = self.render("assessment", "assessment-external", policy=policy)["services"]
        for name in ("backend", "assessment-worker"):
            env = services[name]["environment"]
            self.assertEqual({key: env[key] for key in policy}, policy)
            self.assertNotIn("ASSESSMENT_EXTERNAL_GRADING_API_KEY", env)
        self.assertNotIn("ASSESSMENT_EXTERNAL_GRADING_TOKEN", services["backend"]["environment"])
        self.assertNotIn("ASSESSMENT_EXTERNAL_GRADING_ENABLED",
                         services["assessment-external-grading"].get("environment", {}))

    def test_private_reader_and_gateway_do_not_share_networks(self):
        config = self.render("assessment", "assessment-external")
        services, networks = config["services"], config["networks"]
        inference = services["assessment-inference"]
        gateway = services["assessment-external-grading"]
        worker = services["assessment-worker"]
        self.assertEqual(set(inference["networks"]), {"assessment-inference-net"})
        self.assertTrue(networks["assessment-inference-net"]["internal"])
        self.assertEqual(inference["environment"]["ASSESSMENT_INFERENCE_MODE"], "local")
        self.assertEqual(set(gateway["networks"]), {
            "assessment-external-grading-net", "assessment-external-egress-net",
        })
        self.assertTrue(networks["assessment-external-grading-net"]["internal"])
        self.assertEqual({name for name, service in services.items()
                          if "assessment-external-egress-net" in service.get("networks", {})},
                         {"assessment-external-grading"})
        self.assertIn("assessment-external-grading-net", worker["networks"])
        for service in (worker, services["assessment-worker-py"]):
            self.assertTrue(all(networks[name]["internal"] for name in service["networks"]))
        self.assertIn("assessment-data-net", services["db"]["networks"])
        self.assertIn("assessment-data-net", services["assessment-redis"]["networks"])
        self.assertNotIn("ports", inference)
        self.assertNotIn("ports", gateway)
        self.assertNotIn("volumes", gateway)
        self.assertIn("external_grading:app", gateway["command"])
        self.assertEqual(gateway["image"], inference["image"])


if __name__ == "__main__":
    unittest.main()
