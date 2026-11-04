# Assessment VPS Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development and test-driven-development. Preserve the current checkout and existing design edits.

**Goal:** Implement the approved assessment workflow with durable VPS jobs, configurable provider roles, private storage, teacher review and transactional grade publication.

**Architecture:** NestJS modular monolith with a separately bootstrapped VPS worker, dedicated Redis queue, PostgreSQL state and external private S3 storage. Teacher uploads grouped student work, approves a versioned key/rubric per exam code and finalizes reviewed results. All activation is gated on explicit configuration and readiness.

**Tech Stack:** Existing NestJS/TypeORM/PostgreSQL/BullMQ and React/Vite; JSON schemas in docs/assessment/contracts are canonical.

## Task 1 — Backend business foundation

- [x] Add assessment module entities/migration and register them in app/CLI; no automatic production migration.
- [x] Add shared class×subject authorization preserving existing school policies and wrong-scope 404.
- [x] Add context, assessments, submissions, exam versions, uploads, review, process and finalize endpoints according to data-and-api-contract.md. All writes validate tenant and revisions.
- [x] Preserve integer score units; nullable unknown answers; no model-controlled final score or approval.
- [x] Publish GradeEntry + immutable publication/audit in one transaction; guard legacy grade PATCH/DELETE for assessment sources.
- [x] Write/run focused Jest tests before implementation; build and lint changed files. Verify tenant, stale revision, score/rubric validation and publication idempotency.

## Task 2 — Worker, storage, models

- [x] Add runtime feature/routing validation and private S3 adapter with staged/sealed immutable object flow.
- [x] Add independent worker bootstrap, DB jobs dispatcher/reconciler, BullMQ delivery, leases/fencing, bounded retries and checkpoint persistence.
- [x] Add sharp/Poppler preparation, provider adapters (Google native and OpenAI-compatible), typed roles, deterministic objective grading, rubric scoring and code validation.
- [x] Budget paid calls and checkpoints; absent credentials/profile quality readiness pauses work, never fabricates results.
- [x] Test malformed outputs, unknown scores, retries, stale completion and deployment readiness; no paid provider calls without explicitly configured pilot.

## Task 3 — Frontend and privacy

- [x] Build class/subject assessment list and workspace, grouped uploads, processing states, exam key review and exception-first results.
- [x] Add revision-aware review/finalize and per-item batch outcomes; never silently approve missing data.
- [x] Bypass Axios cache on assessment reads; invalidate grade caches after publication.
- [x] Restrict service-worker caching to public assets, prevent private evidence caching, purge old image cache and session Cache Storage.
- [x] Add meaningful Vitest/privacy tests; run frontend build/lint.

## Task 4 — VPS infrastructure

- [x] Add assessment-redis with AOF everysec/noeviction/volume/healthcheck and no host port; separate cache Redis.
- [x] Add opt-in assessment-worker image with Poppler, sharp runtime, one job/two calls, bounded resources and temporary volume.
- [x] Configure object storage externally, env examples without credentials, feature disabled default. Update root and backend production manifests consistently.
- [x] Add readiness and operational runbook, disk limits, shutdown/recovery and log rotation.

## Integration and release gate

- [x] Run backend build/unit/integration checks and frontend build/unit checks, compose/workflow config validation.
- [x] Review implemented core flow and fix provider routing/budget, grading evidence, revision, transaction and retry issues. UI crop/overlay and revision-aware main-sheet selection are implemented.
- [x] Report exact implemented scope and blockers. No production deployment or claim of OCR quality without real configured storage/providers, DB migration/recovery tests and benchmark evidence.
