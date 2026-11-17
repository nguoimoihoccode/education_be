"""Pilot gate per school × class × subject (design §4).

The API owns ``school_assessment_pilot_scopes``; a missing row is closed. The
worker never claims a job outside an active scope (see ``jobs.CLAIM``) and
re-reads the state before each budget reservation and each result write, so a
pause stops new model calls and keeps a call that was already in flight from
overwriting a review. The row is read ``FOR SHARE``: an operator's pause waits
for a write that already passed the check, and the next check sees the pause.

A stop raises ``pilot_paused`` / ``pilot_closed``; ``retry_decision`` parks the
job as ``paused`` and reopening the scope re-queues exactly those jobs.
"""

from __future__ import annotations

from typing import Any, Mapping

import asyncpg

from .db.jobs import JobError

PILOT_STATE = """
SELECT p.state
  FROM school_assessments a
  JOIN school_assessment_pilot_scopes p
    ON p.school_id=a.school_id AND p.class_id=a.class_id
   AND p.subject_id=a.subject_id
 WHERE a.id=$1 AND a.school_id=$2
   FOR SHARE OF p
"""


async def assert_pilot_active(
    connection: asyncpg.Connection, job: Mapping[str, Any]
) -> None:
    """Call inside the transaction that reserves budget or writes results."""
    state = await connection.fetchval(
        PILOT_STATE, job["assessment_id"], job["school_id"]
    )
    if state == "active":
        return
    raise JobError("pilot_paused" if state == "paused" else "pilot_closed")
