# FE-BE Compatibility Design

## Context

The workspace contains two separate repositories:

- `education_fe`: React/Vite frontend
- `education_be`: NestJS backend

The frontend is already configured to talk to `http://localhost:3000`, and several core API groups already match the backend:

- `auth` login/register/refresh
- `education`
- `quizzes`
- `flashcards`

The current integration problems are:

1. Runtime startup is inconsistent because the top-level `docker-compose.yml` references `education-fe` and `education-be`, while the actual directories are `education_fe` and `education_be`.
2. Several frontend routes expect backend endpoints that do not exist:
   - `GET/PATCH /auth/profile`
   - `POST /auth/change-password`
   - `POST /auth/avatar`
   - `documents/*`
   - `social/*`
   - `community/*`
3. Some frontend modules use response shapes that do not directly match existing backend models, especially around social and community features.

The user's requirement is to make the frontend use the backend with minimal frontend disruption, preferring backend expansion and compatibility over frontend rewrites.

## Goal

Make `education_fe` work against `education_be` with a backend-first compatibility strategy:

- preserve existing working FE/BE integrations
- add compatibility endpoints in the backend for mismatched routes
- keep frontend edits minimal and limited to cases where the backend should not mimic the existing contract
- fix startup/configuration so the system can actually be run and verified

## Non-Goals

- Rebuilding social/community as fully new product areas
- Large frontend refactors
- Replacing existing `education`, `quiz`, or `flashcard` contracts that already match
- Introducing a second source of business logic separate from the current backend services

## Proposed Approach

### 1. Runtime and startup fixes

Fix the top-level orchestration first so local verification is possible.

Planned changes:

- update `docker-compose.yml` to use the real repo directory names
- keep FE API base URL aligned with backend port `3000`
- keep backend `FRONTEND_URL` aligned with frontend local URL

Success criteria:

- the compose configuration points to valid directories
- FE and BE can be started without path-related failures

### 2. Auth compatibility endpoints

Add missing profile-related routes directly to the backend auth/user layer:

- `GET /auth/profile`
- `PATCH /auth/profile`
- `POST /auth/change-password`
- `POST /auth/avatar`

Design constraints:

- reuse current auth/user entities and services
- do not create parallel auth state or duplicate token logic
- prefer adding small DTOs and service methods over mixing profile logic into controllers without boundaries

Expected frontend impact:

- `UserProfile.tsx` should stop failing on 404 for its main actions

### 3. Document compatibility layer

The frontend currently calls `documents/*`, while the backend exposes `document-import/*`.

Design decision:

- add a backend compatibility controller for `documents/*`
- route the compatible endpoints into existing document-import services where possible
- adapt response payloads in the controller layer if the FE expects a slightly different shape

Important limitation:

If the frontend expects lifecycle steps that do not exist in backend services yet, compatibility will be implemented to the maximum sensible extent and any missing deep workflow will be called out explicitly.

### 4. Social compatibility layer

The frontend expects `social/*`, while the backend currently exposes `soulie/*`.

Design decision:

- add `social/*` compatibility endpoints in the backend
- reuse `SoulieService` as the source of truth wherever a direct mapping exists
- add lightweight response adapters so the frontend receives the structure it expects

Mapping principle:

- controller compatibility layer performs translation
- existing `soulie` business logic stays authoritative
- no duplicate social business rules

### 5. Community compatibility layer

The frontend expects `community/*`, but the backend does not have a dedicated community module with matching concepts.

Design decision:

- implement minimal compatibility endpoints in the backend
- reuse existing `soulie` data where a meaningful mapping exists
- for contracts with no current backend domain, return stable minimal structures matching FE expectations so screens do not break

Guardrails:

- these endpoints are compatibility endpoints, not full feature completion
- avoid fake complexity; return simple paginated empty or derived payloads where no real backing data exists
- clearly mark this layer as transitional in code comments only where needed

### 6. Preserve correct existing integrations

Do not rewrite working integrations:

- `education_fe/src/api/auth.api.ts` for login/register/refresh
- `education_fe/src/api/education.api.ts`
- `education_fe/src/api/quiz.api.ts`
- `education_fe/src/api/flashcard.api.ts`

These contracts already align with backend controllers and should remain unchanged unless a verification step reveals a concrete incompatibility.

## Architecture

The implementation should use thin compatibility controllers on the backend.

Pattern:

1. Frontend calls compatibility route such as `/social/feed`
2. Compatibility controller validates input and calls existing backend service or a dedicated compatibility service
3. Compatibility layer transforms domain output into the response contract expected by the frontend
4. Existing domain services remain the single place for real business logic

This keeps the compatibility surface explicit and prevents route aliases from leaking duplicated logic throughout the codebase.

## Component Boundaries

### Backend

- `auth` and `users` remain responsible for authentication and profile state
- `document-import` remains responsible for document ingestion and extraction
- `soulie` remains responsible for social-domain behavior
- new compatibility controllers/services own:
  - route aliases
  - response-shape adaptation
  - temporary fallback payloads for unsupported community contracts

### Frontend

- keep existing API modules and pages intact wherever backend compatibility is added
- only patch frontend calls if a route is fundamentally incorrect or a payload assumption cannot reasonably be supported by the backend

## Data Flow

### Auth profile flow

- FE loads profile from `/auth/profile`
- backend reads authenticated user from the existing auth context
- backend returns user profile in the shape expected by FE
- edit, password change, and avatar upload update the same underlying user/auth data

### Document flow

- FE calls `documents/*`
- backend compatibility controller translates request to `document-import` service calls
- backend returns adapted payload to keep FE flow stable

### Social/community flow

- FE calls `social/*` or `community/*`
- backend compatibility controller either:
  - maps to `SoulieService`, or
  - returns a stable compatibility payload when no direct backend concept exists

## Error Handling

- Return proper HTTP errors for real auth and validation failures
- Avoid `404` for known compatibility routes that the frontend currently depends on
- For unsupported community features, prefer valid empty payloads over crashes when the FE already tolerates empty lists
- Preserve existing NestJS exception handling and validation patterns

## Testing Strategy

Implementation will use TDD for behavior changes.

Required verification areas:

- backend controller/service tests for:
  - auth profile endpoints
  - document compatibility routes
  - social compatibility routes
  - community compatibility responses
- smoke verification for compose path fixes
- frontend build check to ensure compatibility changes do not require unplanned FE rewrites

Where automated tests are impractical for top-level compose behavior, use targeted smoke checks and document the exact commands and expected outcomes in the implementation plan.

## Risks and Tradeoffs

### Backend bloat

Risk:

- too many alias routes can make the backend harder to maintain

Mitigation:

- keep compatibility code thin
- centralize transformation in dedicated compatibility services/helpers
- reuse existing domain services instead of copying logic

### Contract mismatch

Risk:

- frontend payload expectations may not match backend entities one-to-one

Mitigation:

- adapt at the backend edge
- only modify FE when the backend should not emulate the contract

### Partial domain coverage

Risk:

- `community/*` does not fully exist in the backend today

Mitigation:

- implement stable minimal payloads
- distinguish compatibility completion from true product completeness

### Verification blockers

Risk:

- startup or database dependencies may block full runtime validation

Mitigation:

- fix orchestration first
- run build/tests/smoke checks in layers
- report any external blockers explicitly

## Success Criteria

The work is complete when all of the following are true:

1. `docker-compose.yml` points to valid repo directories.
2. Existing matching FE/BE routes remain intact.
3. The backend exposes compatibility endpoints for auth profile, documents, social, and community flows used by the frontend.
4. Frontend pages that currently fail because of missing routes no longer fail for those reasons.
5. Verification has been run and any remaining unsupported cases are explicitly documented as compatibility gaps rather than silent failures.

## Final Decision

Use a backend-first hybrid compatibility strategy:

- fix runtime orchestration first
- preserve existing correct contracts
- add thin backend compatibility layers for missing frontend routes
- keep frontend changes minimal and justified by clear backend-domain limits
