"""asyncpg pool with JSON codecs registered on every connection.

asyncpg returns ``json``/``jsonb`` as text by default. The Node worker reads
those columns through TypeORM, which parses them, so the Python side must hand
the processor dictionaries as well — register the codec once per connection
instead of calling ``json.loads`` at each read site.
"""

from __future__ import annotations

import json
from typing import Any

import asyncpg


async def _init_connection(connection: asyncpg.Connection) -> None:
    for type_name in ("json", "jsonb"):
        await connection.set_type_codec(
            type_name,
            schema="pg_catalog",
            encoder=lambda value: json.dumps(value, ensure_ascii=False),
            decoder=json.loads,
        )


async def create_pool(
    dsn: str, *, max_size: int = 4, **kwargs: Any
) -> asyncpg.Pool:
    """A small pool: the worker runs one job at a time (``maxParallelJobs``)."""
    return await asyncpg.create_pool(
        dsn,
        min_size=1,
        max_size=max_size,
        init=_init_connection,
        **kwargs,
    )
