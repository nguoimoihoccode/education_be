"""JSON and hashing that match ``JSON.stringify`` in the Node API.

``hash()`` in ``src/modules/assessment/domain/assessment.policy.ts`` sorts object
keys and then stringifies. The API stores ``routing_policy_hash`` on every job and
the worker compares it, so the bytes here must match the Node side exactly.
``digest()`` in ``runtime/provider.ts`` stringifies without sorting, so dict
insertion order is part of the contract too.

Two differences from :func:`json.dumps` matter and are handled here:

* key order follows UTF-16 code units (JavaScript), not code points;
* numbers use the ECMAScript ``Number::toString`` spelling (``1`` not ``1.0``,
  ``1e-7`` not ``1e-07``).
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any


def _code_units(text: str) -> tuple[int, ...]:
    """Sort key matching JavaScript's default string comparison."""
    units: list[int] = []
    for character in text:
        code = ord(character)
        if code > 0xFFFF:
            code -= 0x10000
            units.append(0xD800 + (code >> 10))
            units.append(0xDC00 + (code & 0x3FF))
        else:
            units.append(code)
    return tuple(units)


def _split_exponent(text: str) -> tuple[str, int]:
    """Return (digits, exponent) so that value == int(digits) * 10 ** exponent."""
    mantissa, _, exponent = text.partition("e")
    power = int(exponent) if exponent else 0
    whole, _, fraction = mantissa.partition(".")
    # value == int(whole + fraction) * 10 ** -len(fraction)
    power -= len(fraction)
    digits = (whole + fraction).lstrip("0")
    if not digits:
        return "0", 0
    # Leading zeros do not change the integer value; trailing zeros divide it by
    # ten each, so the exponent grows with every one removed.
    trailing = len(digits) - len(digits.rstrip("0"))
    return digits.rstrip("0"), power + trailing


def js_number(value: float | int) -> str:
    """Format a finite number the way JavaScript's ``String(number)`` does."""
    if isinstance(value, bool):
        raise TypeError("js_number does not format booleans")
    if isinstance(value, int):
        if abs(value) <= 2**53 - 1:
            return str(value)
        value = float(value)
    if math.isnan(value) or math.isinf(value):
        return "null"  # JSON.stringify writes null for non-finite numbers
    if value == 0:
        return "0"
    sign = "-" if value < 0 else ""
    digits, power = _split_exponent(repr(abs(value)))
    length = len(digits)
    point = power + length  # value == 0.digits * 10 ** point
    if -6 < point <= 21:
        if point <= 0:
            return f"{sign}0.{'0' * -point}{digits}"
        if point >= length:
            return f"{sign}{digits}{'0' * (point - length)}"
        return f"{sign}{digits[:point]}.{digits[point:]}"
    mantissa = digits if length == 1 else f"{digits[0]}.{digits[1:]}"
    exponent = point - 1
    return f"{sign}{mantissa}e{'+' if exponent >= 0 else '-'}{abs(exponent)}"


def _write(value: Any, out: list[str]) -> None:
    if value is None:
        out.append("null")
    elif value is True:
        out.append("true")
    elif value is False:
        out.append("false")
    elif isinstance(value, str):
        out.append(json.dumps(value, ensure_ascii=False))
    elif isinstance(value, (int, float)):
        out.append(js_number(value))
    elif isinstance(value, (list, tuple)):
        out.append("[")
        for index, item in enumerate(value):
            if index:
                out.append(",")
            _write(item, out)
        out.append("]")
    elif isinstance(value, dict):
        out.append("{")
        for index, (key, item) in enumerate(value.items()):
            if index:
                out.append(",")
            out.append(json.dumps(str(key), ensure_ascii=False))
            out.append(":")
            _write(item, out)
        out.append("}")
    else:  # pragma: no cover - callers pass JSON-derived values only
        raise TypeError(f"cannot serialise {type(value).__name__}")


def stringify(value: Any) -> str:
    """``JSON.stringify`` with no indentation and non-ASCII kept literal."""
    out: list[str] = []
    _write(value, out)
    return "".join(out)


def stable(value: Any) -> Any:
    """Recursively sort object keys, as ``hash()`` does before stringifying."""
    if isinstance(value, list):
        return [stable(item) for item in value]
    if isinstance(value, dict):
        ordered = sorted(value.keys(), key=_code_units)
        return {key: stable(value[key]) for key in ordered}
    return value


def hash_value(value: Any) -> str:
    """Hex SHA-256 of the key-sorted JSON, identical to the Node ``hash()``."""
    return hashlib.sha256(stringify(stable(value)).encode()).hexdigest()


def digest(value: Any) -> str:
    """Hex SHA-256 of JSON with insertion order preserved (Node ``digest()``)."""
    return hashlib.sha256(stringify(value).encode()).hexdigest()
