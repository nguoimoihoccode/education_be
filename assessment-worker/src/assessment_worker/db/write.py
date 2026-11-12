"""INSERT/UPDATE built from dicts, with TypeORM's camelCase mapping.

The processor writes rows the way TypeORM's repository does — pass the columns
that change, leave the rest alone — so callers pass Python attribute names and
this module maps them to the snake_case column names.

``None`` is written as SQL NULL; omitting the key leaves the column untouched.
Python has no ``undefined``, which is how the Node call sites express "skip".
"""

from __future__ import annotations

import re
from typing import Any, Mapping, Sequence

import asyncpg

_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")
_CAMEL_BOUNDARY = re.compile(r"(?<!^)(?=[A-Z])")


def column_name(name: str) -> str:
    """``currentPageIds`` -> ``current_page_ids``."""
    column = _CAMEL_BOUNDARY.sub("_", name).lower()
    if not _IDENTIFIER.match(column):
        raise ValueError(f"invalid_column:{name}")
    return column


def table_name(name: str) -> str:
    if not _IDENTIFIER.match(name):
        raise ValueError(f"invalid_table:{name}")
    return name


def _where(criteria: Mapping[str, Any], offset: int) -> tuple[str, list[Any]]:
    if not criteria:
        raise ValueError("empty_criteria")
    parts: list[str] = []
    values: list[Any] = []
    for index, (key, value) in enumerate(criteria.items()):
        parts.append(f"{column_name(key)}=${offset + index + 1}")
        values.append(value)
    return " AND ".join(parts), values


async def update(
    connection: asyncpg.Connection,
    table: str,
    values: Mapping[str, Any],
    criteria: Mapping[str, Any],
    *,
    returning: Sequence[str] = (),
    touch: bool = True,
) -> list[asyncpg.Record]:
    if not values:
        raise ValueError("empty_update")
    params = list(values.values())
    assignments = [
        f"{column_name(key)}=${index + 1}" for index, key in enumerate(values)
    ]
    if touch and "updated_at" not in values:
        # TypeORM's repository.update() refreshes @UpdateDateColumn; raw SQL
        # does not, so the row would look stale to the API's polling.
        assignments.append("updated_at=now()")
    where, where_values = _where(criteria, offset=len(params))
    sql = (
        f"UPDATE {table_name(table)} SET {', '.join(assignments)} "
        f"WHERE {where}"
    )
    arguments = [*params, *where_values]
    if not returning:
        await connection.execute(sql, *arguments)
        return []
    columns = ", ".join(column_name(column) for column in returning)
    return await connection.fetch(f"{sql} RETURNING {columns}", *arguments)


async def insert(
    connection: asyncpg.Connection,
    table: str,
    values: Mapping[str, Any],
    *,
    returning: Sequence[str] = (),
    touch: bool = True,
) -> list[asyncpg.Record]:
    if not values:
        raise ValueError("empty_insert")
    columns = [column_name(key) for key in values]
    literals: dict[str, str] = {}
    if touch:
        for timestamp in ("created_at", "updated_at"):
            if timestamp not in columns:
                columns.append(timestamp)
                literals[timestamp] = "now()"
    arguments = list(values.values())
    placeholders: list[str] = []
    position = 0
    for column in columns:
        if column in literals:
            placeholders.append(literals[column])
        else:
            position += 1
            placeholders.append(f"${position}")
    sql = (
        f"INSERT INTO {table_name(table)} ({', '.join(columns)}) "
        f"VALUES ({', '.join(placeholders)})"
    )
    if not returning:
        await connection.execute(sql, *arguments)
        return []
    returning_columns = ", ".join(column_name(column) for column in returning)
    return await connection.fetch(f"{sql} RETURNING {returning_columns}", *arguments)
