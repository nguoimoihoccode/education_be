"""PostgreSQL fixture shared by the worker tests.

Gated by ``ASSESSMENT_TEST_PG``. Each test gets a fresh schema that holds a
minimal copy of the columns the worker touches, not the whole migration schema.
"""

from __future__ import annotations

import os
import uuid

import asyncpg
import pytest

from assessment_worker.config import DatabaseConfig
from assessment_worker.db.pool import create_pool

TABLES = """
CREATE TABLE school_assessment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  assessment_id uuid NOT NULL DEFAULT gen_random_uuid(),
  submission_id uuid NULL,
  stage text NOT NULL,
  scope_key text NOT NULL,
  input_hash text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'pending',
  dispatch_generation integer NOT NULL DEFAULT 0,
  lease_token uuid NULL,
  lease_until timestamptz NULL,
  lease_owner text NULL,
  fencing_token integer NOT NULL DEFAULT 0,
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text NULL,
  result_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  execution_target text NOT NULL DEFAULT 'vps_colocated',
  routing_version text NOT NULL DEFAULT '1',
  routing_policy_hash text NOT NULL,
  producer_agent text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1
);
CREATE TABLE school_assessment_submissions (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL,
  input_revision integer NOT NULL DEFAULT 1,
  processing_state text NOT NULL DEFAULT 'idle',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE school_assessment_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  submission_id uuid NULL,
  purpose text NOT NULL DEFAULT 'submission',
  original_name text NOT NULL DEFAULT 'scan.pdf',
  declared_mime text NOT NULL,
  verified_mime text NULL,
  byte_size bigint NOT NULL,
  sha256 text NULL,
  staging_key text NULL,
  sealed_key text NULL,
  storage_version_id text NULL,
  state text NOT NULL DEFAULT 'uploading',
  upload_expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  sealed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE school_assessment_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  assessment_id uuid NOT NULL,
  format text NOT NULL,
  snapshot_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'queued',
  output_object_key text NULL,
  created_by integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '1 hour',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL DEFAULT 1
);
"""


def connection_kwargs() -> dict[str, object]:
    return {
        "host": os.environ.get("ASSESSMENT_TEST_PG_HOST") or "127.0.0.1",
        "port": int(os.environ.get("ASSESSMENT_TEST_PG_PORT") or 5432),
        "user": os.environ.get("ASSESSMENT_TEST_PG_USER") or "postgres",
        "password": os.environ.get("ASSESSMENT_TEST_PG_PASSWORD") or "",
        "database": os.environ.get("ASSESSMENT_TEST_PG_DATABASE") or "postgres",
    }


@pytest.fixture
async def pool():
    connection = await asyncpg.connect(**connection_kwargs())
    schema = f"worker_{uuid.uuid4().hex[:12]}"
    await connection.execute(f"CREATE SCHEMA {schema}")
    await connection.execute(f"SET search_path TO {schema},public;{TABLES}")
    try:
        created = await create_pool(
            DatabaseConfig(**connection_kwargs()).dsn,  # type: ignore[arg-type]
            server_settings={"search_path": f"{schema},public"},
        )
        yield created
        await created.close()
    finally:
        await connection.execute(f"DROP SCHEMA {schema} CASCADE")
        await connection.close()
