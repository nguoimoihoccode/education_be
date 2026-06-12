# Education Platform Missing APIs Design

## Goal

Add the PostgreSQL-backed APIs currently expected by the Education frontend
without changing the separate Soulie application, its `/soulie/*` routes, or
its `soulie_*` tables.

The scope covers:

- Education social feed
- Education leaderboard
- User profile updates, password changes, and avatar uploads
- Learning activity logs
- Synchronous JSON/CSV data exports with persisted history

## Boundaries

### In scope

- Preserve the frontend's existing request and response contracts where they
  are already defined.
- Store new Social, activity log, and export metadata in PostgreSQL.
- Store avatar and export files on the backend server's local filesystem.
- Add TypeORM migrations and register every new entity in both Nest runtime
  configuration and the TypeORM CLI data source.
- Add unit, controller, and integration coverage for authorization, ownership,
  pagination, filtering, and persistence behavior.

### Out of scope

- No changes to `SoulieModule`, `/soulie/*`, or `soulie_*`.
- No moderation, reporting, post editing, or post deletion in the first Social
  release.
- No background queue or worker for exports.
- No S3 or Supabase Storage integration.
- No persisted leaderboard snapshot or historical rank-change calculation.
- No attempt to reconstruct social events that happened before this feature.

## Architecture

Use independent NestJS modules with `UsersModule` as the shared identity
dependency:

- `EducationSocialModule`: posts, comments, likes, bookmarks, and trending tags.
- `EducationLeaderboardModule`: read-only aggregation over existing learning
  tables.
- `ActivityLogModule`: persisted new events plus historical projections from
  existing learning records.
- `DataExportModule`: synchronous file generation and export history.
- Existing `AuthModule` and `UsersModule`: profile, password, and avatar
  endpoints.

This keeps feature ownership explicit and prevents the existing
`EducationModule` and `EducationService` from growing further.

## Database Design

All new Education-owned tables use the `edu_` prefix.

### `edu_social_posts`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `author_id` | integer | FK to `users.id`, cascade delete |
| `content` | text | Required, trimmed, maximum 5000 characters |
| `image_url` | varchar, nullable | Optional externally or locally hosted image |
| `type` | enum | `achievement`, `question`, `share`, `milestone` |
| `tags` | text array | Normalized without leading `#`, maximum 10 |
| `shares_count` | integer | Defaults to zero; response compatibility only |
| `created_at` | timestamp | Indexed for feed ordering |
| `updated_at` | timestamp | Standard update timestamp |

Indexes:

- `(created_at DESC)`
- `(type, created_at DESC)`
- GIN index on `tags`

### `edu_social_comments`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `post_id` | UUID | FK to social post, cascade delete |
| `author_id` | integer | FK to user, cascade delete |
| `content` | text | Required, trimmed, maximum 2000 characters |
| `likes_count` | integer | Defaults to zero; comment-like API is not in scope |
| `created_at` | timestamp | Feed response ordering |

### `edu_social_post_likes`

Composite unique key `(post_id, user_id)`. Repeating the like endpoint toggles
the row. Counts are calculated from this table rather than stored on the post.

### `edu_social_post_bookmarks`

Composite unique key `(post_id, user_id)`. Repeating the bookmark endpoint
toggles the row. Bookmarks are private to the current user.

### `edu_activity_logs`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `user_id` | integer | FK to user, cascade delete |
| `type` | enum | `system`, `learning`, `practice`, `social`, `achievement` |
| `action` | varchar | Stable machine-friendly action name |
| `detail` | text | Human-readable description |
| `xp` | integer | Defaults to zero |
| `metadata` | jsonb | Optional resource IDs and event details |
| `created_at` | timestamp | Indexed with user and type |

The service records new events after successful domain operations. Logging is
best-effort: a log failure is reported to application logging but does not roll
back a completed learning action.

### `edu_data_exports`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `user_id` | integer | FK to user, cascade delete |
| `format` | enum | `json`, `csv` |
| `time_range` | enum | `all`, `30days`, `yeartodate` |
| `data_types` | jsonb | Selected profile/progress/flashcard/quiz/forum flags |
| `status` | enum | `completed`, `failed` |
| `file_name` | varchar | Server-generated safe name |
| `file_path` | varchar | Private server path, never returned to clients |
| `file_size` | bigint | Bytes |
| `error_message` | text, nullable | Sanitized generation failure |
| `created_at` | timestamp | Export history ordering |
| `completed_at` | timestamp, nullable | Completion timestamp |

`custom` time range is rejected until the frontend sends explicit start and end
dates.

## API Contracts

All endpoints below require the global JWT guard unless explicitly stated.

### Education Social

Base route: `/social`

#### `GET /social/feed`

Query:

- `type`: optional post type
- `page`: defaults to 1
- `limit`: defaults to 20, maximum 100

Response:

```json
{
  "data": [
    {
      "id": "uuid",
      "author": {
        "id": "1",
        "name": "Learner",
        "avatar": null,
        "level": 4,
        "badge": "streak"
      },
      "content": "Study update",
      "image": null,
      "likes": 3,
      "comments": [],
      "shares": 0,
      "isLiked": true,
      "isBookmarked": false,
      "createdAt": "2026-06-12T10:00:00.000Z",
      "tags": ["HSK1"],
      "type": "share"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

Author level comes from `UserStreak.level`, defaulting to 1. Badge is derived
deterministically from streak/level and is not persisted.

#### `POST /social/posts`

Accepts the frontend `CreatePostDto`. Returns the created mapped post. Records
a `social/post_created` activity event after persistence.

#### `POST /social/posts/:postId/like`

Atomically toggles the current user's like and returns:

```json
{ "likes": 4, "isLiked": true }
```

#### `POST /social/posts/:postId/bookmark`

Atomically toggles the current user's bookmark and returns:

```json
{ "isBookmarked": true }
```

#### `POST /social/posts/:postId/comments`

Accepts `{ "content": "..." }`, creates a comment, and returns the frontend
`SocialComment` shape.

#### `GET /social/trending`

Returns the ten most-used tags from posts created in the last 30 days:

```json
[{ "tag": "#HSK1", "posts": "24 posts" }]
```

### Leaderboard

Base route: `/education/leaderboard`

The routes must be declared before `/education/:dynamic` routes where route
ordering could otherwise cause ambiguity.

#### Metrics

- `xp`: `UserStreak.totalXp`
- `streak`: `UserStreak.currentStreak`
- `lessons`: count of completed `UserLesson` rows
- `quiz`: average percentage score of completed `QuizSession` rows
- `level`: `UserStreak.level`, default 1
- `badge`: derived from level and streak
- `change`: `same`
- `changeAmount`: `0`

For `week` and `month`, lessons and quiz metrics are constrained by completion
timestamps. Existing XP and streak entities do not contain event history, so
their current values are used for all periods. The API documents this
limitation instead of inventing historical values.

#### `GET /education/leaderboard`

Supports `period`, `category`, `page`, `limit`, and `search`. It returns the
frontend `LeaderboardResponse`, including `currentUser` when the current user
matches the result set.

#### `GET /education/leaderboard/stats`

Returns aggregate totals:

```json
{
  "totalXp": 12000,
  "totalLessons": 80,
  "totalQuizzesPassed": 25,
  "totalHoursStudied": 42
}
```

Hours are derived only from `UserCourse.totalTimeSpent`. Lesson completion
already increments that enrollment total, so also summing `UserLesson.timeSpent`
would double-count the same activity. The stored unit is seconds; the aggregate
divides the sum by 3600 and rounds to one decimal place.

#### `GET /education/leaderboard/me`

Returns the current user's row and rank for the default all-time XP ranking, or
an unranked row with rank zero if they have no learning activity.

### Profile and Security

Base route: `/auth`

#### `PATCH /auth/profile`

Accepts `displayName` and `phone`. The display name maps to `User.name`.
Whitespace-only names are rejected. Returns the same auth user response shape
used by login so Zustand can replace its current user.

#### `POST /auth/change-password`

Accepts `currentPassword` and `newPassword`.

- Email/password users must provide the correct current password.
- OAuth-only users receive a clear `400` response because they do not have a
  local password.
- New passwords use the registration password policy and are hashed with
  bcrypt.
- Successful change revokes all refresh-token sessions except the current one.

#### `POST /auth/avatar`

Accepts multipart field `avatar`.

- Allowed MIME types: JPEG, PNG, WebP
- Maximum size: 5 MB
- Stored under the configured media storage root in an `avatars` directory
- Generated file names contain the user ID and a random UUID, never the
  original file name
- Replacing an avatar removes the previous locally managed avatar after the
  database update succeeds
- Returns the standard auth user response

### Activity Logs

#### `GET /education/logs`

Supports `type`, `page`, `limit`, and case-insensitive `search`.

The response merges:

1. Persisted `edu_activity_logs`
2. Projected historical lesson completions
3. Projected historical completed quiz sessions
4. Projected historical flashcard review sessions

Projected rows use deterministic IDs such as `lesson:<userLessonId>` so
pagination and frontend keys remain stable. Results are sorted by timestamp and
deduplicated by source metadata.

New events are written for:

- Lesson completion
- Exercise submission where XP changes
- Vocabulary review
- Flashcard review completion
- Quiz completion
- Course enrollment
- Social post/comment creation
- Data export creation
- Profile and password changes

### Data Exports

Base route: `/education/exports`

#### `GET /education/exports`

Returns the current user's export history newest first. It maps file size to a
human-readable string expected by the frontend and never exposes `filePath`.

#### `POST /education/exports`

Validates the requested format, time range, and selected data types. It gathers
only the authenticated user's records and writes the file before responding.

- JSON produces one structured document with a section per selected data type.
- CSV produces a ZIP archive containing one CSV file per selected data type
  because the sections have different columns.
- The completed metadata row is returned immediately.
- Generation failure creates a failed metadata row and returns a server error.
- File generation uses streaming APIs where practical and safe CSV escaping.

#### `GET /education/exports/:exportId/download`

Checks ownership, verifies that the export is completed and the file still
exists, then streams it as an attachment. Missing files return `404` without
exposing server paths.

## Data Flow

### Social request

1. Global JWT guard resolves the user.
2. Controller validates DTO/query parameters.
3. Service reads or mutates `edu_social_*` tables in a transaction where a
   toggle and count must remain consistent.
4. Mapper builds the existing frontend response shape.
5. Successful create actions emit an activity-log call.

### Export request

1. Validate request and create the export metadata row.
2. Query only selected user-owned datasets.
3. Write to a temporary file inside the export storage directory.
4. Atomically rename the completed file.
5. Update metadata to `completed` with size and completion time.
6. Return the mapped history item.

Temporary files are removed in a `finally` block. A failure marks the row
`failed`.

## Error Handling

- Unknown social posts return `404`.
- Invalid social type, empty content, oversized tags, and invalid pagination
  return `400`.
- Profile/password/avatar validation returns consistent Nest validation errors.
- Export ownership failures return `404` to avoid revealing another user's
  export IDs.
- Database constraints enforce duplicate-like and duplicate-bookmark safety;
  toggle operations also use transactions to handle concurrent requests.
- Filesystem errors are logged with internal detail but return sanitized API
  messages.

## Security

- Every query scopes user-private data by the JWT subject.
- Export paths and original upload names are never returned.
- CSV cells beginning with `=`, `+`, `-`, or `@` are prefixed to prevent
  spreadsheet formula injection.
- Avatar MIME type and decoded image format are both validated.
- Social content is returned as plain data; frontend rendering must continue to
  avoid raw HTML injection.
- Existing global throttling remains, with stricter endpoint-level limits for
  avatar upload and export generation.
- Soulie authorization and persistence remain untouched.

## Testing Strategy

### Unit tests

- Social mapping, tag normalization, pagination, toggles, and trending counts
- Leaderboard metric aggregation, ordering, search, period behavior, and ties
- Password verification, OAuth-only rejection, hashing, and session revocation
- Avatar validation and safe file naming
- Historical activity projection and deduplication
- JSON/CSV serialization, CSV injection protection, and export mapping

### Controller tests

- JWT user ID is passed into every user-owned operation
- DTO/query validation and response shape
- Download ownership and missing-file behavior

### Integration tests

- PostgreSQL migration creates all constraints and indexes
- Social create/feed/like/bookmark/comment lifecycle
- Leaderboard reads real learning records
- Profile/password/avatar lifecycle
- Export creation, history, and download
- Activity logs combine persisted and projected records
- Soulie routes continue to resolve unchanged

### Verification commands

```bash
npm run lint:check
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
npm run migration:show
```

## Delivery Order

1. Database entities and migration registration
2. Activity log foundation
3. Education Social API
4. Leaderboard API
5. Profile, password, and avatar APIs
6. Synchronous export API
7. Cross-feature activity logging
8. FE contract cleanup and removal of silent fallbacks only after BE contracts
   are verified

Each stage must be independently testable and must not modify Soulie behavior.
