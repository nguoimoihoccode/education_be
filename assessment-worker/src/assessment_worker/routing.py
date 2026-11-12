"""Provider routing, ported from ``runtime/routing.ts``.

The routing snapshot is written by the API and compared here through
``routing_policy_hash``, so admission rules must reject exactly what Node
rejects. Profiles stay plain dicts: ``provider.ts`` hashes one of them with
insertion-order ``JSON.stringify``, and rebuilding it into a dataclass would
silently reorder the keys and break the cache key.

The schema lives in ``docs/assessment/contracts`` because the build context is
the repo root; :func:`_contracts` finds that directory from the process cwd so
the worker behaves the same in the image (``/app``) and under ``pytest``.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

import jsonschema

from .db.jobs import JobError

SAFE_INTEGER = 2**53 - 1

Profile = dict[str, Any]
Routing = dict[str, Any]

_contracts_dir: Path | None = None


def _contracts() -> Path:
    """Locate ``docs/assessment/contracts`` from the cwd or one of its parents."""
    global _contracts_dir
    if _contracts_dir is not None:
        return _contracts_dir
    override = os.environ.get("ASSESSMENT_CONTRACTS_PATH")
    candidates = [Path(override)] if override else []
    base = Path.cwd()
    candidates += [base, *base.parents]
    for directory in candidates:
        contract = directory / "docs" / "assessment" / "contracts"
        if contract.is_dir():
            _contracts_dir = contract
            return contract
    raise JobError("routing_schema_missing")


def _schema(name: str) -> dict[str, Any]:
    return json.loads((_contracts() / name).read_text("utf-8"))


def contracts_dir() -> Path:
    """The shared contract directory; other modules load the same schemas."""
    return _contracts()


def assert_provider_dialect(profile: Mapping[str, Any]) -> None:
    if not (
        (
            profile.get("provider") == "google"
            and profile.get("apiDialect") == "google_generate_content"
        )
        or (
            profile.get("provider") == "deepseek"
            and profile.get("apiDialect") == "openai_chat_completions"
        )
    ):
        raise JobError("provider_dialect_invalid")


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _validate(schema: Mapping[str, Any], value: Any) -> None:
    validator = jsonschema.Draft7Validator(
        schema, format_checker=jsonschema.FormatChecker()
    )
    validator.validate(value)


def parse_routing(input: Any, date: str | None = None) -> Routing:
    _validate(_schema("agent-routing.schema.json"), input)
    cfg: Routing = input
    for profile in cfg["profiles"].values():
        assert_provider_dialect(profile)
    if cfg.get("deploymentState") != "pilot":
        raise JobError("routing_not_pilot")
    allowlist = cfg["policy"]["tenantProviderAllowlist"]
    for agent in cfg["agents"].values():
        for key in (
            "primaryProfileId",
            "fallbackProfileId",
            "escalationProfileId",
            "visionProfileId",
        ):
            profile_id = agent.get(key)
            if not profile_id:
                continue
            profile = cfg["profiles"].get(profile_id)
            if not profile or profile.get("provider") not in allowlist:
                raise JobError("profile_not_allowed")
            if profile.get("qualityGate") != "passed":
                raise JobError("profile_not_ready")
    execution = cfg["execution"]
    if execution["pauseBelowFreeDiskGiB"] >= execution["admitFreeDiskGiB"]:
        raise JobError("disk_thresholds_invalid")
    select_profile(cfg, "image_reader", True, date or _today())
    return cfg


def select_profile(
    cfg: Routing,
    role: str,
    vision: bool,
    date: str | None = None,
) -> tuple[str, Profile]:
    day = date or _today()
    agent = cfg["agents"].get(role)
    if not agent or agent.get("mode") == "code_only":
        raise JobError("role_not_model")
    vision_id = agent.get("visionProfileId")
    if vision and vision_id:
        ids: list[str | None] = [vision_id]
    else:
        ids = [agent.get("primaryProfileId"), agent.get("fallbackProfileId")]
    allowlist = cfg["policy"]["tenantProviderAllowlist"]
    for profile_id in ids:
        if not profile_id:
            continue
        profile = cfg["profiles"].get(profile_id)
        if (
            not profile
            or profile.get("qualityGate") != "passed"
            or profile.get("provider") not in allowlist
        ):
            continue
        assert_provider_dialect(profile)
        if vision and "vision" not in profile.get("capabilities", ()):
            raise JobError("vision_required")
        allow_through = profile.get("allowThroughDate")
        if allow_through and allow_through < day:
            continue
        if profile["pricing"]["validThroughDate"] < day:
            continue
        return profile_id, profile
    raise JobError("profile_expired_or_unavailable")


def load_routing(path: str | None = None) -> Routing:
    target = path or os.environ.get("ASSESSMENT_ROUTING_CONFIG_PATH")
    if not target:
        raise JobError("routing_path_required")
    return parse_routing(json.loads(Path(target).read_text("utf-8")))


def _safe_integer(value: Any) -> bool:
    # ``Number.isSafeInteger`` — booleans are not numbers in JavaScript.
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and abs(value) <= SAFE_INTEGER
    )


def reserve_cost_micros(
    input_tokens: int,
    output_tokens: int,
    input_rate: int,
    output_rate: int,
) -> int:
    if not all(
        _safe_integer(value) and value >= 0
        for value in (input_tokens, output_tokens, input_rate, output_rate)
    ):
        raise JobError("cost_invalid")
    cost = (
        input_tokens * input_rate + output_tokens * output_rate + 999999
    ) // 1000000
    if cost > SAFE_INTEGER:
        raise JobError("cost_overflow")
    return cost
