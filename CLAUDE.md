# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

NestJS 11 backend for a **language-learning education platform** (Vietnamese-market product). It exposes REST APIs consumed by `education_fe`. Core domains: courses/lessons, flashcards with spaced repetition, quizzes (incl. AI generation), an AI tutor, document-to-content import, gamification (streaks/XP/leaderboard), plus auth/session management and data export. A **school-management platform** is being added on top (see `docs/SCHOOL_PLATFORM_PLAN.md`): Phase 1 shipped the `school` module (schools, academic years, subjects, classes, teaching assignments, rosters, principal role); Phase 2 added the GVCN teaching hub and the parent invite flow (`ParentLink`); Phase 3 added the timetable (`TimeSlot` + conflict policy) and attendance (`AttendanceRecord` — quick session check-in, class history, parent/student views); Phase 4 added two-way schoolwork — grades (`GradeEntry` / sổ điểm) and homework (`HomeworkAssignment`) with an automatic quiz→grade bridge into Learning Hub, plus grade-based per-class student ranking (`rank.policy.ts`, `GET /grades/ranking`).

> Historical note: this codebase evolved from a social platform ("Soulie") and before that a stock app. The Soulie module has been fully removed — do not resurrect it from stale references. Some stock-era remnants still exist in the frontend.

## Development Commands

```bash
npm run start:dev            # Dev with hot reload
npm run build                # Production build (nest build)
npm run start:prod           # node dist/main

# Migrations (TypeORM CLI via ts-node)
npm run migration:run        # Apply pending migrations
npm run migration:revert     # Revert last migration
npm run migration:show       # Migration status
npm run migration:run:prod   # Against compiled dist/ (deploy)

npm run generate:jwt-keys    # node scripts/generate-jwt-keys.mjs -> keys/private.pem + keys/public.pem

npm run bootstrap:school -- --email <principal> --school "Name" --code <CODE> --year "2026-2027" --start YYYY-MM-DD --end YYYY-MM-DD
                             # idempotent CLI: grants PRINCIPAL + creates/links the school & current year (solves POST /school chicken-and-egg)

npm run test                 # Jest unit tests
npm run test:watch / test:cov / test:e2e
npm run lint                 # ESLint --fix;  npm run lint:check for CI
npm run ci                   # lint:check + test + build (used by CI pipeline)
```

## Architecture

Modules registered in `src/app.module.ts`: `UsersModule`, `AuthModule`, `EducationModule`, `ActivityLogModule`, `EducationLeaderboardModule`, `DocumentImportModule`, `DataExportModule`, `AiModule`, `SchoolModule`. (`ProfileStorageModule` is not top-level — imported by `AuthModule`.)

There is **no global URL prefix**: routes live at the root, e.g. `/auth/login`, `/education/courses`, `/flashcards/decks`. Swagger UI is at `/api` (config only, not a prefix).

### Module Map

**auth** (`/auth`) — register/login/logout/refresh (all `@Public`), Google OAuth (`GET auth/google`, `auth/google/callback`), profile update, change-password, avatar upload (delegates to profile-storage). Session management: `GET/DELETE auth/sessions` (own), `auth/admin/sessions` (`@Roles(ADMIN)`). Scheduled `token-cleanup.task.ts` prunes expired refresh tokens/blacklist entries. Login-attempt tracking (migration `AddAuthLoginAttempts`).

**users** (`/users`) — `me`, admin listing (`@Roles(ADMIN, EDUCATION_ADMIN)`), role assignment (`PUT :id/roles` ADMIN only), teacher application flow: `POST become-teacher` + `PUT :id/verify-teacher` (admin). Roles enum in `src/common/enums/roles.enum.ts`: `ADMIN | USER | STUDENT | TEACHER | EDUCATION_ADMIN | PRINCIPAL | PARENT`; `SCHOOL_ADMIN_ROLES = [PRINCIPAL, ADMIN]` guards the school module. `roles` is a TypeORM `simple-array` column — adding a role needs no migration.

**education** — the largest module, split across several controllers:
- `education.controller.ts` (`/education`): public catalog (`languages`, `courses`); teacher/admin CRUD for courses/lessons/vocabulary/exercises (`@Roles(TEACHER, EDUCATION_ADMIN, ADMIN)`); enrollment, lesson completion, progress, streak; **Today/Learning-Coach**: `GET education/today`, `today-plan`, `recommendations/today`, `coach/summary`, `POST today-plan/tasks/:taskId/complete`; vocabulary review endpoints (`GET vocabulary/review`, `POST vocabulary/:id/review`).
- `flashcard.controller.ts` (`/flashcards`): 26 endpoints — decks CRUD + public decks + topic listing, flashcard CRUD + bulk create + search + import-from-vocabulary, SRS review (`review/start`, `review/:flashcardId`, `review/complete`, `GET review/due`), stats (global/per-deck), history.
- `quiz.controller.ts` (`/quizzes`): quiz + question CRUD (incl. bulk add), `POST quizzes/generate` (**AI-generated quizzes**), sessions (`:id/start`, `sessions/:sessionId/answer`, `/complete`, `sessions/:sessionId/questions`), stats (overall + `stats/topic/:topic`), history, wrong-answer review (`sessions/:id/wrong`, `wrong-answers`), per-quiz `:id/leaderboard`.
- `services/` — 17 services split by concern (course-catalog, lesson-content, user-course, vocabulary, streak, learning-plan, flashcard-deck/-item/-review/-statistics, quiz-generation/-management/-question/-session/-session-completion/-statistics).
- **Multi-step writes are transactional** — lesson completion (`completeLesson`: lesson record + course time + progress + streak in one transaction), lesson creation, quiz answer submit / session complete (pessimistic lock on the session row), flashcard create/bulk/delete/import (deck cardCount moves with the cards), flashcard review and vocabulary review (insert-or-ignore skeleton row + `pessimistic_write` lock — first-review races can't 23505 or lose SRS updates), enrollment (unique-violation → 409). `StreakService.recordActivity` accepts a `runner?: EntityManager` so the streak update can join the caller's transaction; keep this pattern when adding new multi-step flows.
- `domain/` — **pure business policies with unit tests, keep it that way**: `srs.policy.ts` (SM-2 spaced repetition: ease factor, intervals, statuses new/learning/reviewing/mastered), `quiz-grading.policy.ts`, `quiz-helpers.ts`, `quiz-ownership.ts`.
- `entities/` — 18 entities: language, course, lesson, exercise, vocabulary + user tracking (user-course, user-lesson, user-vocabulary, user-streak, daily-learning-task, review-session) + flashcards (flashcard, flashcard-deck, user-flashcard) + quizzes (quiz, quiz-question, quiz-session).

**ai** (`/ai`) — AI tutor chat. `GET/POST ai/conversations`, messages, history; `POST ai/chat` one-shot. Server-side calls to an **OpenAI-compatible `/chat/completions` API**, default provider **Groq** (`https://api.groq.com/openai/v1`, model `llama-3.3-70b-versatile`). Config resolution is 3-tier: DB row (admin-set, `ai-provider-settings` entity, **API key encrypted at rest** via `ai-crypto.util.ts` AES + `ENCRYPTION_KEY`) → env vars → built-in defaults. Admin-only `GET/PUT ai/settings` + `POST ai/settings/test`. `AiConversation` messages support per-conversation `system_rules` (migration `AddAiSystemRules`). Conversations/messages persist to `ai-conversation` / `ai-message` entities.

**document-import** (`/document-import`) — turn documents into learning content. `POST upload` (text+keywords), `upload-with-phrases`, `GET supported-types`, and the real flow `POST preview` → `POST confirm` (persist generated content), plus `POST convert`. Accepted types: **PDF, DOCX, DOC, XLSX, XLS, JSON, TXT** (libs: pdf-parse, mammoth, xlsx). Architecture: `parsers/` (registry + markdown/json/freetext/structured parsers), `generators/` (abstract `content-generator` + **flashcard, vocabulary, lesson, quiz generators** feeding the education entities). Keyword extraction is heuristic (language-aware, min length, max count).

**education-leaderboard** (`/education/leaderboard`) — `GET` list, `stats`, `me`. Categories `xp | streak | lessons | quiz`, periods `week | month | all` (default week), rank badges from level+streak. Aggregate indexes in migration `1800000000001`.

**activity-log** (`/education/logs`) — audit trail; services call `recordBestEffort()` so logging never breaks main flows.

**data-export** (`/education/exports`) — user self-service data export (GDPR-style): request a `json` or `csv` export over a time range (`all | 30days | yeartodate`), status `completed | failed`, `GET :exportId/download`.

**profile-storage** — avatars on local filesystem under `MEDIA_STORAGE_PATH`, path `users/<id>/avatars/<n>-<uuid>.<ext>` validated by regex + path-traversal guard.

**school** (`/school`, `/school/classes`, `/school/teaching`, `/parent`, `/timetable`, `/attendance`, `/grades`, `/homework`, `/me`) — school platform (docs/SCHOOL_PLATFORM_PLAN.md Phases 1–4). `SchoolService`: `resolveSchoolIdForUser` (principal → teacher assignment → homeroom teacher → student membership → ADMIN first-school fallback) is the tenant root — **every by-id lookup must be `findOne({ id, schoolId })` so wrong-tenant ids 404, never 403/leak (rule D1)**; school CRUD, academic years (+ activate), subjects (delete archives when assignments reference it), stats, teachers (grouped from assignments). `ClassService` (`school-class.service.ts`): classes CRUD (delete archives when roster non-empty), teaching assignments, roster — `addStudents` bulk-adds by email, creating STUDENT accounts with a one-time `temporaryPassword` (randomBytes + bcryptjs), enforcing one-active-class-per-school and `maxStudents` capacity. `ParentLinkService` (`parent-link.service.ts`, Phase 2): the GVCN hub (`/school/teaching`, `@Roles(TEACHER, PRINCIPAL, ADMIN)`) — homeroom classes with live counts, GVCN-scoped roster, parent invites; access is checked per class (that class's GVCN, or principal/ADMIN) and **all denials are 404** (`assertClassAccess`). The parent portal (`/parent`, JWT-only on purpose — the invite code itself authorizes a claim, and every read scopes by the caller's own id): `claimInvite` redeems a code (grants PARENT role, link stays `pending` until the GVCN approves — design D5), children list + approved-only child profile (never exposes student emails/roles to parents; teacher contact is exposed). Entities: `schools`, `school_academic_years`, `school_subjects`, `school_classes`, `school_teaching_assignments`, `school_class_memberships`, `school_parent_links` (uuid PKs; user FKs are integer `users.id`). `school-sanitize.util.ts` strips `passwordHash` from user relations before serialization (the column has no `select: false`). New activity type `school` on the `edu_activity_type_enum`; audit actions `school.parent.{invite,approve,revoke,claim}`. Phase 3 services: `TimetableService` (`timetable.service.ts`) — weekly grid per class (`GET /timetable?classId=`, staff of that class only), `GET /timetable/me` (teacher slots across classes / student's class grid), `POST /timetable/slots` + `DELETE /timetable/slots/:id` (**principal/ADMIN only**, and a slot requires an existing `TeachingAssignment` teacher×subject×class), `POST /timetable/validate` (what-if, never saves), plus `getChildTimetable` on the parent controller (approved links only, teacher names — never emails). Writes run the pure `domain/timetable-conflict.policy.ts` (`findTimetableConflicts` — teacher/class/room buckets per weekday+period; room normalized trim+uppercase, empty never clashes) BEFORE insert and 409 with the first message; the DB unique `(classId, weekday, periodNumber)` is the last-resort class-cell guard. Weekday numbering is the plan's: **1 = Chủ nhật, 2..7 = Thứ 2..Thứ 7**. `AttendanceService` (`attendance.service.ts`) — `GET /attendance/session?classId&date&periodNumber` (roster merged with existing marks + the TKK slot label), `POST /attendance/take` (bulk upsert one whole session, unique `(classId, date, periodNumber, studentId)`), `GET /attendance` (history + rate summary over a date range); write access = that class's GVCN ∥ assigned teacher ∥ principal/ADMIN, all denials 404. `domain/attendance-rate.policy.ts` (`summarizeAttendance`) computes attendanceRate = (present+late)/total×100 (1 decimal) and unexcusedAbsences; statuses `present|absent|late|excused`. `PATCH /school/period-config` edits `School.periodConfig` jsonb (pre-wired in Phase 1). Entities `school_time_slots` + `school_attendance` (migration `1860000000000-AddTimetableAttendance`); `TimeSlot` denormalizes `academicYearId` from its class. New audit actions `school.timetable.{slot_add,slot_remove}`, `school.attendance.take`, `school.period_config.update`. Phase 4 services: `GradesService` (`grades.service.ts`, `/grades`) — `POST /grades` + `PATCH/DELETE /grades/:id` + `GET /grades/report` (TEACHER/PRINCIPAL/ADMIN via `assertWriteAccess`: homeroom ∥ subject assignment ∥ principal, denials 404), `GET /grades` (list scoped: principal = school, teacher = own classes, student = self only — `query.studentId` can NEVER widen a student's read), `GET /grades/me` (student), `getChildGrades` on the parent controller (same `{studentId, subjects[]}` shape). Test types `oral|15min|45min|final`, `DEFAULT_COEFFICIENT` = {oral 1, 15min 1, 45min 2, final 2} (changeable per entry), score `numeric(4,1)` 0–10 with a ValueTransformer (pg returns strings), term 1|2 with `currentTerm()` = Sep–Dec→1 else 2. Averages come from the pure `domain/grade-average.policy.ts` (`computeGradeAverages`): midterm = coefficient-weighted mean of non-final, final = weighted mean of finals, year = (midterm×2 + final)/3, each part rounded to 1 decimal BEFORE combining, `byType` = raw mean per type, all null-safe. `HomeworkService` (`homework.service.ts`) — `POST /homework` + `GET /homework` + `DELETE /homework/:id` (creator may always delete; others need class write access), `GET /me/homework` (`me.controller.ts`, STUDENT — rows + `graded` join so the FE ticks "đã làm"), `getChildHomework` (parent). A homework targets an existing Learning Hub `quiz` or `flashcard_deck` by id (`countsAsGrade` is silently forced false for decks; quiz/deck are global tables with no schoolId — existence check only, a noted limitation). **The quiz→grade bridge**: `QuizSessionCompletionService` (education) calls `recordQuizGrade({userId, sessionId, quizId, scorePercent, homeworkId?})` after completing a session — it resolves the student's active classes, finds `countsAsGrade` homework pointing at that quiz, and upserts a `GradeEntry` (testType 15min, score = quiz%/10 rounded, `quizSessionId` set, latest attempt wins; partial unique index `UQ_grades_quiz_session`). `homeworkId` from the request is only a hint. Wrapped in try/catch + Logger.warn — **Learning Hub must never fail because of school-side errors**. Module wiring: EducationModule imports SchoolModule (`HomeworkService` exported); SchoolModule registers education `Quiz`+`FlashcardDeck` in its own forFeature (read-only checks, no FK, no cycle). Entities `school_grades` + `school_homework` (migration `1870000000000-AddGradesHomework`; homework delete cascades its auto-grades). `getStats` (principal dashboard) now also returns `avgScore` (AVG over school grades, 1 decimal, null when empty), `attendanceRate` + `attendanceSessions` (30 days, via `summarizeAttendance`). New audit actions `school.grade.{add,update,auto}`, `school.homework.{assign,delete}`. **Student ranking by grades** (xếp hạng): pure `domain/rank.policy.ts` (`rankCompetition` — competition "1224": ties share a rank and the next rank is skipped, `null` values sink unranked to the bottom) used by `getClassRanking` behind `GET /grades/ranking?classId&subjectId?&term?` (staff-only): per-student score = `year ?? midterm` (`scoreFor`), class-wide (no subjectId) = 1-decimal mean of that student's per-subject scores, ungraded roster members list last with `rank: null`; subject-scoped access reuses `assertWriteAccess` while class-wide (it mixes every subject's grades) is homeroom ∥ principal ∥ ADMIN only — all denials 404 (D1). `getStudentGrades` (student + parent views) embeds `rank`/`rankedCount` per `SubjectGrades` row, recomputed live per subject×term group — read-only, no new column or migration.

### Authentication System

- RS256 JWT with RSA key pair (`keys/`, gitignored — generate with `npm run generate:jwt-keys`).
- Access tokens: **15 min**; refresh tokens: **7 days with rotation** (old token revoked on use), stored server-side with **device fingerprinting** (`auth/helpers/device-info.helper.ts`) and a **token blacklist** for immediate revocation.
- Strategies: `jwt.strategy.ts`, `jwt-refresh.strategy.ts`, `google.strategy.ts`.

### Global Providers (`app.module.ts`)

- **`JwtAuthGuard` as APP_GUARD** — every route requires auth unless marked `@Public()` (`src/common/decorators/`). When adding endpoints, decide explicitly: public vs role-guarded.
- `ThrottlerGuard` (limits via `THROTTLE_TTL`/`THROTTLE_LIMIT`), `AllExceptionsFilter` (uniform `{statusCode, message, error, timestamp, path}`), `LoggingInterceptor`, `helmet` in `main.ts`.
- `src/common/` also holds health checks, pagination DTO, custom pipes/decorators/utils.

### Cache (`src/common/cache/`)

- `CacheModule` + `CacheService`: two-tier cache — always-on in-memory layer + optional Redis layer (`REDIS_URL`; unset → memory-only, so local dev needs no Redis). Every command degrades to memory when Redis is unreachable (warn-logged at most every 30s). Values are JSON round-tripped: treat cached results as snapshots (Dates come back as ISO strings).
- `EducationLeaderboardModule` and `EducationModule` import `CacheModule`. `EducationLeaderboardService` caches `list`/`stats`/`me` for 60s (`lb:*` keys; `list` keys include userId because `currentUser` is per-user). `CourseCatalogService` caches `getLanguages`/`getCourses` for 300s (`edu:catalog:*` keys) and invalidates via `deletePrefix` in `createCourse`/`updateCourse`.
- Services constructed manually (facade pattern) accept a `CacheService` param with a `new CacheService(null)` default, so unit tests construct them without a cache argument.

### Multi-instance scale (Redis optional throughout)

- **Rate limits**: `app.module.ts` wires `RedisThrottlerStorage` (`src/common/cache/throttler-redis.storage.ts`) into `ThrottlerModule` when `REDIS_URL` is set, so `THROTTLE_*` counters are shared across instances; without Redis each instance keeps per-process counters. Redis errors fall back to in-memory counting (fail-open) with a 30s-throttled warning.
- **Document parsing**: `DocumentParseQueueService` (`document-import` module, BullMQ) moves PDF/DOCX/XLSX parsing off the HTTP path. `POST document-import/queue` returns 202 `{jobId}`; `GET document-import/queue/:jobId` polls `queued|active|completed|failed` (results kept 15 min; statuses are owner-scoped by userId). Each instance runs a worker (concurrency 2) on the shared `document-parse` queue; without `REDIS_URL` it degrades to in-process background parsing with the same API.

### Configuration

Env vars validated by Joi in `src/config/config.validation.ts`. Required: `DB_*`, `PORT`, `NODE_ENV`, `FRONTEND_URL`. Optional: `GOOGLE_*`, `ENCRYPTION_KEY` (AI provider settings), AI defaults (`AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`), `MEDIA_STORAGE_PATH`, `THROTTLE_*`, `REDIS_URL` (shared cache + cross-instance rate limits + document-parse queue; docker-compose points it at the `redis` service). `.env`, `.env.prod` and their examples live at the **repo root's parent** (`../`) as well as locally.

### Database

- TypeORM + PostgreSQL, data source `src/database/data-source.ts`, migrations in `src/database/migrations/` (read the latest ones to understand current schema; they are the source of truth). School tables arrive in `1840000000000-AddSchoolFoundation` (also does `ALTER TYPE edu_activity_type_enum ADD VALUE 'school'`), `1850000000000-AddParentLinks`, `1860000000000-AddTimetableAttendance` and `1870000000000-AddGradesHomework`. `data-source.ts` registers entities **explicitly** — a new entity needs an import + entry in `entities`. `src/database/seeders/` holds `bootstrap-school.cli.ts` (a standalone DataSource script, not an app seeder).
- Entities live in each module's `entities/` dir.

### Testing

Jest; 54 `*.spec.ts` colocated in `src/` (domain policies, services, controllers, migrations in `database/migration-tests/`). Structure: `test/unit`, `test/integration`, `test/e2e`.

## Important Notes / Current Gaps

- **No billing/subscription code exists.** The frontend "Premium" page is UI-only.
- **No email/password-reset** and no WebSocket gateway (real-time chat not implemented server-side).
- AI generation is used by quiz generation and coach summaries via `AiService.completeJson` (JSON mode) — prompts for the coach are in **Vietnamese**; keep user-facing generated text Vietnamese-aware.
- `learning-plan.service.ts` (~660 lines) and `ai.service.ts` (~585 lines) are growing hotspots — prefer extracting pure policies into `education/domain/` (with specs) when touching them.
- `OPTIMIZATION_SUMMARY.md`, `PAGINATION_GUIDE.md`, `API_DOCUMENTATION.md` exist in this folder for extra context.
