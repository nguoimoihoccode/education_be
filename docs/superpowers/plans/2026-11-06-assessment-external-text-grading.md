# External assessment text grading implementation plan

**Goal** — Keep student documents in private infrastructure and submit only explicitly approved short-answer text to the configured gateway.

**Architecture** — Separate private model transport from the external text gateway. Bind external requests to a validated input revision, explicit approval, and current policy. Require a teacher review of the exact result before publication.

- [x] Add tests for the closed public inference route and private model contract, then wire the existing processor only to private inference.
- [x] Add strict text gateway tests with a mocked provider, then implement signed requests, payload and output validation, replay rejection, and fixed routing.
- [x] Add a per-answer teacher release and bind it to the exact minimal payload. Recheck the current revision before issuing a signed request. Keep a durable call reservation and preserve manual grading on failure.
- [x] Persist teacher result approval and enforce it at the publication API. Select only approved results for bulk publication.
- [x] Isolate Compose services, document model and network requirements, and verify Python, backend, frontend, and Compose configuration with synthetic data.


## Verification and deployment boundary

The gateway and private model transports were exercised with synthetic fixtures and mocked provider responses. PostgreSQL tests run in an isolated rollback schema. Authenticated content proxies replace signed read URLs, and session-scoped browser object URLs are revoked on logout and component cleanup.

The OCR/layout model server is separately provisioned and remains unconfigured by the sample environment. The Compose topology separates private networks and opt-in text egress. The VPS host egress rules, private storage reachability, model quality, and container runtime still require staging acceptance. No production service, migration, real student submission or paid provider was activated by this implementation.

In the first release, a teacher explicitly reviews the exact per-question text and rubric before authorizing the external route. Pattern checks and roster matching are supplementary safeguards. Already-transmitted requests cannot be undone by the revoke action.
