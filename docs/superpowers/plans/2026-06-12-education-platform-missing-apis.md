# Education Platform Missing APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement PostgreSQL-backed Education Social, leaderboard, profile/security, activity-log, and synchronous data-export APIs while leaving Soulie unchanged.

**Architecture:** Add focused NestJS modules for Social, leaderboard, activity logs, and exports. Keep identity mutations in Auth/Users, derive leaderboard data from existing learning tables, and expose the exact contracts already consumed by the React frontend. New entities are registered in both Nest runtime TypeORM configuration and the CLI data source, with one reversible migration.

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL, Jest/Supertest, React 19, TanStack Query, Axios, Vitest, JSZip

---

## Working Rules

- Work in `education_be` unless a step explicitly names `education_fe`.
- Do not modify or remove `/soulie/*`, `SoulieModule`, or any `soulie_*` table.
- The current backend worktree contains unrelated uncommitted Slides work. Preserve it and stage only files listed by each task.
- Use `apply_patch` for manual edits.
- Follow RED-GREEN-REFACTOR for every behavior change.
- Use integer user IDs in new entities because `users.id` is an integer. Convert legacy string user IDs only at existing Education service boundaries.
- Do not use `synchronize` as a schema delivery mechanism.

## File Map

### Backend files to create

- `src/database/migrations/1800000000000-AddEducationPlatformApis.ts`
- `src/modules/activity-log/activity-log.module.ts`
- `src/modules/activity-log/activity-log.service.ts`
- `src/modules/activity-log/activity-log.controller.ts`
- `src/modules/activity-log/activity-log.service.spec.ts`
- `src/modules/activity-log/activity-log.controller.spec.ts`
- `src/modules/activity-log/dto/activity-log-query.dto.ts`
- `src/modules/activity-log/entities/activity-log.entity.ts`
- `src/modules/education-social/education-social.module.ts`
- `src/modules/education-social/education-social.controller.ts`
- `src/modules/education-social/education-social.controller.spec.ts`
- `src/modules/education-social/education-social.service.ts`
- `src/modules/education-social/education-social.service.spec.ts`
- `src/modules/education-social/dto/social.dto.ts`
- `src/modules/education-social/entities/social-post.entity.ts`
- `src/modules/education-social/entities/social-comment.entity.ts`
- `src/modules/education-social/entities/social-post-like.entity.ts`
- `src/modules/education-social/entities/social-post-bookmark.entity.ts`
- `src/modules/education-leaderboard/education-leaderboard.module.ts`
- `src/modules/education-leaderboard/education-leaderboard.controller.ts`
- `src/modules/education-leaderboard/education-leaderboard.controller.spec.ts`
- `src/modules/education-leaderboard/education-leaderboard.service.ts`
- `src/modules/education-leaderboard/education-leaderboard.service.spec.ts`
- `src/modules/education-leaderboard/dto/leaderboard-query.dto.ts`
- `src/modules/profile-storage/profile-storage.module.ts`
- `src/modules/profile-storage/profile-storage.service.ts`
- `src/modules/profile-storage/profile-storage.service.spec.ts`
- `src/modules/data-export/data-export.module.ts`
- `src/modules/data-export/data-export.controller.ts`
- `src/modules/data-export/data-export.controller.spec.ts`
- `src/modules/data-export/data-export.service.ts`
- `src/modules/data-export/data-export.service.spec.ts`
- `src/modules/data-export/data-export.serializer.ts`
- `src/modules/data-export/data-export.serializer.spec.ts`
- `src/modules/data-export/dto/data-export.dto.ts`
- `src/modules/data-export/entities/data-export.entity.ts`
- `test/integration/education-platform/education-platform.e2e-spec.ts`

### Backend files to modify

- `package.json`
- `package-lock.json`
- `.env.example`
- `src/app.module.ts`
- `src/database/data-source.ts`
- `src/config/config.validation.ts`
- `src/common/decorators/rate-limit.decorator.ts`
- `src/modules/users/users.module.ts`
- `src/modules/users/users.service.ts`
- `src/modules/users/users.service.spec.ts`
- `src/modules/auth/auth.module.ts`
- `src/modules/auth/auth.controller.ts`
- `src/modules/auth/auth.controller.spec.ts`
- `src/modules/auth/auth.service.ts`
- `src/modules/auth/auth.service.spec.ts`
- `src/modules/auth/dto/user-response.dto.ts`
- `src/modules/education/education.module.ts`
- `src/modules/education/education.service.ts`
- `src/modules/education/education.service.spec.ts`
- `src/modules/education/flashcard.service.ts`
- `src/modules/education/flashcard.service.spec.ts`
- `src/modules/education/quiz.service.ts`
- `src/modules/education/quiz.service.spec.ts`

### Frontend files to modify

- `education_fe/src/api/social.api.ts`
- `education_fe/src/api/social.api.test.ts`
- `education_fe/src/api/leaderboard.api.ts`
- `education_fe/src/pages/Social.tsx`
- `education_fe/src/pages/Social.test.tsx`
- `education_fe/src/pages/DataExportLogs.tsx`
- `education_fe/src/pages/user-profile/hooks/useProfileData.ts`

## Task 1: Add PostgreSQL Schema and Entity Registration

**Files:**
- Create: `src/database/migrations/1800000000000-AddEducationPlatformApis.ts`
- Create: all new `entities/*.entity.ts` files listed in the file map
- Test: `src/database/migrations/1800000000000-AddEducationPlatformApis.spec.ts`
- Modify: `src/app.module.ts`
- Modify: `src/database/data-source.ts`

- [ ] **Step 1: Write the failing migration test**

Create a QueryRunner mock that records SQL and assert that `up()` creates all
six tables, foreign keys, uniqueness constraints, and indexes, while `down()`
drops them in dependency-safe reverse order.

```ts
import { AddEducationPlatformApis1800000000000 } from './1800000000000-AddEducationPlatformApis';

describe('AddEducationPlatformApis1800000000000', () => {
  it('creates education social, activity log, and export tables', async () => {
    const queries: string[] = [];
    const queryRunner = {
      query: jest.fn(async (sql: string) => queries.push(sql)),
    };

    await new AddEducationPlatformApis1800000000000().up(
      queryRunner as never,
    );

    const sql = queries.join('\n');
    expect(sql).toContain('CREATE TABLE "edu_social_posts"');
    expect(sql).toContain('CREATE TABLE "edu_social_comments"');
    expect(sql).toContain('CREATE TABLE "edu_social_post_likes"');
    expect(sql).toContain('CREATE TABLE "edu_social_post_bookmarks"');
    expect(sql).toContain('CREATE TABLE "edu_activity_logs"');
    expect(sql).toContain('CREATE TABLE "edu_data_exports"');
    expect(sql).toContain('UNIQUE ("post_id", "user_id")');
    expect(sql).toContain('USING GIN ("tags")');
  });
});
```

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
npm test -- src/database/migrations/1800000000000-AddEducationPlatformApis.spec.ts --runInBand
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Add entity classes**

Use explicit column names matching the design. The core post entity must have:

```ts
export enum EducationSocialPostType {
  ACHIEVEMENT = 'achievement',
  QUESTION = 'question',
  SHARE = 'share',
  MILESTONE = 'milestone',
}

@Entity('edu_social_posts')
@Index(['createdAt'])
@Index(['type', 'createdAt'])
export class EducationSocialPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'author_id' })
  authorId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'image_url', nullable: true })
  imageUrl?: string;

  @Column({ type: 'enum', enum: EducationSocialPostType })
  type: EducationSocialPostType;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ name: 'shares_count', default: 0 })
  sharesCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

Define the remaining entities with:

- `EducationSocialComment`: UUID, `postId`, `authorId`, content, likesCount,
  createdAt.
- `EducationSocialPostLike`: UUID plus unique `(postId, userId)`.
- `EducationSocialPostBookmark`: UUID plus unique `(postId, userId)`.
- `EducationActivityLog`: UUID, integer user ID, enum type, action, detail, XP,
  JSONB metadata, createdAt.
- `EducationDataExport`: UUID, integer user ID, enum format/timeRange/status,
  JSONB dataTypes, private filePath, fileName, bigint fileSize, errorMessage,
  createdAt, completedAt.

- [ ] **Step 4: Add the reversible migration**

Create PostgreSQL enum types before their tables. Use
`gen_random_uuid()` rather than relying on `uuid-ossp`. Begin `up()` with
`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`; do not remove a shared extension
in `down()`. Create:

```sql
CREATE UNIQUE INDEX "UQ_edu_social_post_likes_post_user"
ON "edu_social_post_likes" ("post_id", "user_id");

CREATE UNIQUE INDEX "UQ_edu_social_post_bookmarks_post_user"
ON "edu_social_post_bookmarks" ("post_id", "user_id");

CREATE INDEX "IDX_edu_social_posts_tags"
ON "edu_social_posts" USING GIN ("tags");

CREATE INDEX "IDX_edu_activity_logs_user_created"
ON "edu_activity_logs" ("user_id", "created_at" DESC);
```

`down()` drops child tables first, then parent tables, then enum types.

- [ ] **Step 5: Register every entity in runtime and CLI configurations**

Add imports and entities to both:

```ts
// src/app.module.ts and src/database/data-source.ts
EducationSocialPost,
EducationSocialComment,
EducationSocialPostLike,
EducationSocialPostBookmark,
EducationActivityLog,
EducationDataExport,
```

Preserve the existing uncommitted `SlideDeck` and `SlidesModule` additions in
`src/app.module.ts`.

- [ ] **Step 6: Run migration test, build, and metadata check**

Run:

```bash
npm test -- src/database/migrations/1800000000000-AddEducationPlatformApis.spec.ts --runInBand
npm run build
npm run migration:show
```

Expected: test and build PASS; migration appears pending until applied.

- [ ] **Step 7: Commit schema**

```bash
git add src/database/migrations/1800000000000-AddEducationPlatformApis.ts \
  src/database/migrations/1800000000000-AddEducationPlatformApis.spec.ts \
  src/modules/activity-log/entities \
  src/modules/education-social/entities \
  src/modules/data-export/entities \
  src/app.module.ts src/database/data-source.ts
git commit -m "feat(db): add education platform API schema"
```

## Task 2: Build Activity Log Read and Write Foundation

**Files:**
- Create: `src/modules/activity-log/*`
- Modify: `src/app.module.ts`
- Test: `src/modules/activity-log/activity-log.service.spec.ts`
- Test: `src/modules/activity-log/activity-log.controller.spec.ts`

- [ ] **Step 1: Write failing service tests**

Cover persisted writes and merged history:

```ts
it('records a user-owned activity event', async () => {
  repository.create.mockReturnValue({ id: 'log-1' });
  repository.save.mockResolvedValue({ id: 'log-1' });

  await service.record({
    userId: 7,
    type: EducationActivityType.LEARNING,
    action: 'lesson_completed',
    detail: 'Completed Intro',
    xp: 10,
    metadata: { lessonId: 'lesson-1' },
  });

  expect(repository.create).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 7, action: 'lesson_completed' }),
  );
});

it('merges persisted logs with deterministic historical projections', async () => {
  repository.findAndCount.mockResolvedValue([[], 0]);
  userLessonRepository.find.mockResolvedValue([
    {
      id: 'ul-1',
      completed: true,
      completedAt: new Date('2026-06-01T00:00:00Z'),
      lesson: { title: 'Intro' },
    },
  ]);

  const result = await service.list(7, { page: 1, limit: 20 });

  expect(result.data[0]).toEqual(
    expect.objectContaining({ id: 'lesson:ul-1', action: 'lesson_completed' }),
  );
});
```

Also test quiz/review projection, filtering, search, stable descending sort,
deduplication by `metadata.sourceKey`, and pagination after merging.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/modules/activity-log/activity-log.service.spec.ts --runInBand
```

Expected: FAIL because the module and service do not exist.

- [ ] **Step 3: Implement DTO, module, and service**

`ActivityLogQueryDto`:

```ts
export class ActivityLogQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(EducationActivityType)
  type?: EducationActivityType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
```

Expose this service API:

```ts
export type RecordActivityInput = {
  userId: number;
  type: EducationActivityType;
  action: string;
  detail: string;
  xp?: number;
  metadata?: Record<string, unknown>;
};

record(input: RecordActivityInput): Promise<void>;
recordBestEffort(input: RecordActivityInput): Promise<void>;
list(userId: number, query: ActivityLogQueryDto): Promise<{
  data: ActivityLogResponse[];
  meta: { total: number; page: number; totalPages: number };
}>;
```

`recordBestEffort` catches and logs persistence failures with Nest `Logger`.
Historical projections query `UserLesson`, `QuizSession`, and `ReviewSession`
for the current user and map IDs to `lesson:*`, `quiz:*`, and `flashcard:*`.

- [ ] **Step 4: Add controller tests and controller**

Test that JWT subject `7` is passed to `list()`:

```ts
await controller.list(
  { user: { sub: 7 } } as RequestWithUser,
  { page: 1, limit: 20 },
);
expect(service.list).toHaveBeenCalledWith(7, { page: 1, limit: 20 });
```

Implement:

```ts
@Controller('education/logs')
export class ActivityLogController {
  @Get()
  list(@Req() req: RequestWithUser, @Query() query: ActivityLogQueryDto) {
    return this.activityLogService.list(req.user!.sub, query);
  }
}
```

- [ ] **Step 5: Register and verify**

Import `ActivityLogModule` in `AppModule`. Run:

```bash
npm test -- src/modules/activity-log --runInBand
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/activity-log src/app.module.ts
git commit -m "feat(activity): add education activity logs"
```

## Task 3: Implement Education Social API

**Files:**
- Create: `src/modules/education-social/*` except entities from Task 1
- Modify: `src/app.module.ts`
- Test: `src/modules/education-social/education-social.service.spec.ts`
- Test: `src/modules/education-social/education-social.controller.spec.ts`

- [ ] **Step 1: Write failing DTO and service tests**

Test:

- tag normalization removes `#`, trims, deduplicates case-insensitively, and
  caps the list at 10;
- feed filters by type and returns author/streak/current-user state;
- like and bookmark endpoints toggle inside transactions;
- unknown post returns `NotFoundException`;
- comment mapping matches `SocialComment`;
- trending counts tags from the last 30 days.

Core expected mapping:

```ts
expect(result.data[0]).toEqual({
  id: 'post-1',
  author: {
    id: '7',
    name: 'Learner',
    avatar: null,
    level: 4,
    badge: 'streak',
  },
  content: 'Study update',
  image: undefined,
  likes: 1,
  comments: [],
  shares: 0,
  isLiked: true,
  isBookmarked: false,
  createdAt: '2026-06-12T10:00:00.000Z',
  tags: ['HSK1'],
  type: 'share',
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/modules/education-social/education-social.service.spec.ts --runInBand
```

Expected: FAIL because Social service does not exist.

- [ ] **Step 3: Implement DTOs**

Create:

```ts
export class CreateEducationSocialPostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;

  @IsOptional()
  @IsUrl()
  image?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsEnum(EducationSocialPostType)
  type: EducationSocialPostType = EducationSocialPostType.SHARE;
}

export class CreateEducationSocialCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
```

Add `EducationSocialFeedQueryDto` extending `PaginationDto` with optional enum
`type`.

- [ ] **Step 4: Implement service transactions and mapper**

Use `DataSource.transaction()` for toggle operations. The like toggle performs
a locked lookup for `(postId, userId)`, inserts or removes it, then counts rows.
The bookmark toggle follows the same pattern.

Feed queries must:

- join author and author streak;
- load comments with authors;
- count likes;
- test current user's like/bookmark with `EXISTS`;
- order comments ascending and posts descending;
- return pagination metadata.

After post/comment creation call:

```ts
await this.activityLogService.recordBestEffort({
  userId,
  type: EducationActivityType.SOCIAL,
  action: 'post_created',
  detail: 'Created a community post',
  metadata: { postId: post.id, sourceKey: `social-post:${post.id}` },
});
```

- [ ] **Step 5: Add controller tests and routes**

Implement exact frontend routes:

```ts
@Controller('social')
export class EducationSocialController {
  @Get('feed')
  getFeed(
    @Req() req: RequestWithUser,
    @Query() query: EducationSocialFeedQueryDto,
  ) {
    return this.socialService.getFeed(req.user!.sub, query);
  }

  @Post('posts')
  createPost(
    @Req() req: RequestWithUser,
    @Body() dto: CreateEducationSocialPostDto,
  ) {
    return this.socialService.createPost(req.user!.sub, dto);
  }

  @Post('posts/:postId/like')
  toggleLike(
    @Req() req: RequestWithUser,
    @Param('postId') postId: string,
  ) {
    return this.socialService.toggleLike(req.user!.sub, postId);
  }

  @Post('posts/:postId/bookmark')
  toggleBookmark(
    @Req() req: RequestWithUser,
    @Param('postId') postId: string,
  ) {
    return this.socialService.toggleBookmark(req.user!.sub, postId);
  }

  @Post('posts/:postId/comments')
  addComment(
    @Req() req: RequestWithUser,
    @Param('postId') postId: string,
    @Body() dto: CreateEducationSocialCommentDto,
  ) {
    return this.socialService.addComment(req.user!.sub, postId, dto);
  }

  @Get('trending')
  getTrending() {
    return this.socialService.getTrending();
  }
}
```

Controller tests assert the JWT subject is used for every current-user field
and mutation.

- [ ] **Step 6: Register module and verify**

```bash
npm test -- src/modules/education-social --runInBand
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/education-social src/app.module.ts
git commit -m "feat(social): add education social API"
```

## Task 4: Implement Derived Education Leaderboard

**Files:**
- Create: `src/modules/education-leaderboard/*`
- Modify: `src/app.module.ts`
- Test: `src/modules/education-leaderboard/education-leaderboard.service.spec.ts`
- Test: `src/modules/education-leaderboard/education-leaderboard.controller.spec.ts`

- [ ] **Step 1: Write failing aggregation tests**

Test XP, streak, completed lessons, average quiz percentage, rank ties, search,
pagination, current user, and period filtering. Lock the time conversion:

```ts
it('converts enrollment seconds to aggregate study hours once', async () => {
  userCourseRepository.sum.mockResolvedValue(5400);
  const result = await service.getGlobalStats();
  expect(result.totalHoursStudied).toBe(1.5);
});
```

Test that week/month affect lesson and quiz completion dates but do not invent
historical XP/streak values.

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/modules/education-leaderboard/education-leaderboard.service.spec.ts --runInBand
```

Expected: FAIL because leaderboard service does not exist.

- [ ] **Step 3: Implement query DTO and aggregation service**

```ts
export enum LeaderboardPeriod {
  WEEK = 'week',
  MONTH = 'month',
  ALL = 'all',
}

export enum LeaderboardCategory {
  XP = 'xp',
  STREAK = 'streak',
  LESSONS = 'lessons',
  QUIZ = 'quiz',
}
```

Use one query builder rooted at `users`, with grouped subqueries for streak,
lesson count, and quiz average. Derive:

```ts
const quizScore =
  totalQuizPoints > 0 ? Math.round((earnedQuizPoints / totalQuizPoints) * 100) : 0;
```

Sort by selected category descending, then XP descending, then user ID
ascending for stable ranks. Return `change: 'same'` and `changeAmount: 0`.

- [ ] **Step 4: Implement routes and route-order tests**

```ts
@Controller('education/leaderboard')
export class EducationLeaderboardController {
  @Get()
  list(
    @Req() req: RequestWithUser,
    @Query() query: LeaderboardQueryDto,
  ) {
    return this.leaderboardService.list(req.user!.sub, query);
  }

  @Get('stats')
  stats() {
    return this.leaderboardService.getGlobalStats();
  }

  @Get('me')
  me(@Req() req: RequestWithUser) {
    return this.leaderboardService.getCurrentUser(req.user!.sub);
  }
}
```

Using a dedicated controller avoids collisions with
`EducationController`'s `/education/courses/:id` routes.

- [ ] **Step 5: Register and verify**

```bash
npm test -- src/modules/education-leaderboard --runInBand
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/education-leaderboard src/app.module.ts
git commit -m "feat(leaderboard): add derived education rankings"
```

## Task 5: Add Profile Update and Password Change APIs

**Files:**
- Create: `src/modules/auth/dto/profile.dto.ts`
- Modify: `src/modules/users/users.service.ts`
- Modify: `src/modules/users/users.service.spec.ts`
- Modify: `src/modules/auth/auth.controller.ts`
- Modify: `src/modules/auth/auth.controller.spec.ts`
- Modify: `src/modules/auth/auth.service.ts`
- Modify: `src/modules/auth/auth.service.spec.ts`
- Modify: `src/modules/auth/dto/user-response.dto.ts`

- [ ] **Step 1: Write failing user/auth service tests**

Test:

```ts
it('updates display name and phone and returns auth user shape', async () => {
  usersService.updateAuthProfile.mockResolvedValue(updatedUser);
  await expect(
    service.updateProfile(7, { displayName: 'New Name', phone: '0900000000' }),
  ).resolves.toEqual(expect.objectContaining({ displayName: 'New Name' }));
});

it('rejects password changes for oauth-only users', async () => {
  usersService.findEntityByIdForAuth.mockResolvedValue({
    provider: 'google',
    passwordHash: 'generated',
  });
  await expect(
    service.changePassword(7, 'token-1', {
      currentPassword: 'old',
      newPassword: 'new-secret',
    }),
  ).rejects.toThrow('Password login is not enabled');
});

it('hashes the new password and revokes other sessions', async () => {
  mockedCompare.mockResolvedValue(true);
  mockedHash.mockResolvedValue('new-hash');
  await service.changePassword(7, 'token-1', dto);
  expect(usersService.updatePasswordHash).toHaveBeenCalledWith(7, 'new-hash');
  expect(refreshTokenRepository.update).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 7, tokenId: expect.anything() }),
    expect.objectContaining({ isRevoked: true }),
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/modules/auth/auth.service.spec.ts src/modules/users/users.service.spec.ts --runInBand
```

Expected: FAIL for missing methods.

- [ ] **Step 3: Add DTOs and UsersService mutations**

```ts
export class UpdateAuthProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  newPassword: string;
}
```

Add `UsersService.updateAuthProfile(userId, changes)` and
`UsersService.updatePasswordHash(userId, passwordHash)`. Trim display name and
phone before persistence.

- [ ] **Step 4: Implement AuthService operations**

Add these public methods; implement the numbered flow immediately below rather
than adding additional wrappers:

```ts
async updateProfile(
  userId: number,
  dto: UpdateAuthProfileDto,
): Promise<UserResponseDto>;

async changePassword(
  userId: number,
  currentTokenId: string | undefined,
  dto: ChangePasswordDto,
): Promise<{ message: string }>;
```

Password flow:

1. fetch full user;
2. require `provider === 'email'`;
3. compare current password;
4. hash new password with cost 10;
5. update hash;
6. revoke every active refresh token except `currentTokenId`;
7. record best-effort activity log.

- [ ] **Step 5: Add controller routes and tests**

```ts
@Patch('profile')
updateProfile(@Req() req: RequestWithAccessUser, @Body() dto: UpdateAuthProfileDto) {
  return this.authService.updateProfile(req.user!.sub, dto);
}

@Post('change-password')
changePassword(@Req() req: RequestWithAccessUser, @Body() dto: ChangePasswordDto) {
  return this.authService.changePassword(
    req.user!.sub,
    req.user?.tokenId,
    dto,
  );
}
```

Add Swagger metadata and test exact service arguments.

- [ ] **Step 6: Verify**

```bash
npm test -- src/modules/auth src/modules/users --runInBand
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/auth src/modules/users
git commit -m "feat(auth): add profile and password management"
```

## Task 6: Add Local Education Avatar Storage

**Files:**
- Create: `src/modules/profile-storage/*`
- Modify: `src/modules/auth/auth.module.ts`
- Modify: `src/modules/auth/auth.controller.ts`
- Modify: `src/modules/auth/auth.controller.spec.ts`
- Modify: `src/config/config.validation.ts`
- Modify: `.env.example`
- Modify: `src/common/decorators/rate-limit.decorator.ts`

- [ ] **Step 1: Write failing storage tests**

Test directory isolation, safe filenames, magic bytes, and replacement cleanup:

```ts
it('stores avatars outside the Soulie directory', () => {
  expect(service.getAvatarDirectory(7)).toBe(
    join('uploads', 'education', 'users', '7', 'avatars'),
  );
});

it.each([
  [Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg'],
  [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'],
  [Buffer.from('524946460000000057454250', 'hex'), 'image/webp'],
])('accepts decoded %s signatures', (buffer, mimeType) => {
  expect(service.detectImageType(buffer)).toBe(mimeType);
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/modules/profile-storage/profile-storage.service.spec.ts --runInBand
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement ProfileStorageService**

Expose:

```ts
getAvatarDirectory(userId: number): string;
detectImageType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null;
saveAvatar(userId: number, file: Express.Multer.File, requestBaseUrl: string):
  Promise<{ publicUrl: string; absolutePath: string }>;
removeManagedAvatar(avatarUrl?: string | null): Promise<void>;
```

Use UUID filenames and derive extension from detected bytes, not the original
name. Only delete files inside the configured Education avatar root.

- [ ] **Step 4: Add avatar route test and implementation**

Use `FileInterceptor('avatar', { storage: memoryStorage(), limits: { fileSize:
5 * 1024 * 1024 } })`. MIME allowlist and byte-signature checks must both pass.

The controller flow is:

```ts
const previousAvatar = await this.authService.getAvatar(req.user!.sub);
const requestBaseUrl =
  this.configService.get<string>('MEDIA_PUBLIC_BASE_URL') ||
  `${req.protocol}://${req.get('host')}`;
const saved = await this.profileStorageService.saveAvatar(
  req.user!.sub,
  file,
  requestBaseUrl,
);
try {
  const user = await this.authService.updateAvatar(
    req.user!.sub,
    saved.publicUrl,
  );
  await this.profileStorageService.removeManagedAvatar(previousAvatar);
  return user;
} catch (error) {
  await unlink(saved.absolutePath).catch(() => undefined);
  throw error;
}
```

Add `@UploadRateLimit()` and Swagger multipart metadata.

- [ ] **Step 5: Add configuration**

```ts
EDUCATION_AVATAR_STORAGE_PATH: Joi.string()
  .default('uploads/education')
  .description('Local root for Education profile avatars'),
```

Document the same key in `.env.example`.

- [ ] **Step 6: Verify**

```bash
npm test -- src/modules/profile-storage src/modules/auth/auth.controller.spec.ts --runInBand
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/modules/profile-storage src/modules/auth \
  src/config/config.validation.ts src/common/decorators/rate-limit.decorator.ts \
  .env.example
git commit -m "feat(profile): add local avatar uploads"
```

## Task 7: Implement Synchronous JSON and CSV Exports

**Files:**
- Create: `src/modules/data-export/*` except entity from Task 1
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/app.module.ts`
- Modify: `src/config/config.validation.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing serializer tests**

Test JSON sections, CSV quoting, and formula injection:

```ts
it.each(['=SUM(A1:A2)', '+cmd', '-2+3', '@import'])(
  'neutralizes spreadsheet formula input %s',
  (value) => {
    expect(escapeCsvCell(value)).toBe(`'${value}`);
  },
);

it('creates one CSV entry per selected dataset', async () => {
  const entries = buildCsvEntries({
    profile: [{ email: 'a@example.com' }],
    quizzes: [{ score: 90 }],
  });
  expect(entries.map((entry) => entry.name)).toEqual([
    'profile.csv',
    'quizzes.csv',
  ]);
});
```

- [ ] **Step 2: Run serializer tests and verify RED**

```bash
npm test -- src/modules/data-export/data-export.serializer.spec.ts --runInBand
```

Expected: FAIL because serializer does not exist.

- [ ] **Step 3: Add JSZip as a direct dependency**

```bash
npm install jszip@3.10.1
```

Expected: `package.json` and `package-lock.json` list JSZip directly.

- [ ] **Step 4: Implement DTO and serializer**

DTO:

```ts
export class RequestDataExportDto {
  @IsEnum(EducationExportFormat)
  format: EducationExportFormat;

  @IsEnum(EducationExportTimeRange)
  timeRange: EducationExportTimeRange;

  @ValidateNested()
  @Type(() => EducationExportDataTypesDto)
  dataTypes: EducationExportDataTypesDto;
}
```

Reject `custom`. Require at least one selected data type.

Serializer API:

```ts
export function serializeJsonExport(data: ExportDataset): Buffer;
export function escapeCsvCell(value: unknown): string;
export function buildCsvEntries(data: ExportDataset):
  Array<{ name: string; content: string }>;
export async function serializeCsvZip(data: ExportDataset): Promise<Buffer>;
```

- [ ] **Step 5: Write failing service tests**

Test:

- current-user data scoping;
- `30days` and `yeartodate` cutoffs;
- temporary file cleanup;
- completed and failed metadata;
- private path not returned;
- ownership/missing-file download errors.

```ts
await service.create(7, dto);
expect(userRepository.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
expect(exportRepository.save).toHaveBeenLastCalledWith(
  expect.objectContaining({ status: EducationExportStatus.COMPLETED }),
);
```

- [ ] **Step 6: Implement DataExportService**

Use repositories for User, UserCourse, UserLesson, FlashcardDeck, Flashcard,
ReviewSession, QuizSession, EducationSocialPost, and EducationDataExport.

Write to:

```text
${EDUCATION_EXPORT_STORAGE_PATH}/${userId}/${exportId}.tmp
${EDUCATION_EXPORT_STORAGE_PATH}/${userId}/${exportId}.json
${EDUCATION_EXPORT_STORAGE_PATH}/${userId}/${exportId}.zip
```

Rename `.tmp` atomically after serialization. Return:

```ts
{
  id,
  date: createdAt.toISOString(),
  format: format.toUpperCase(),
  status,
  size: formatBytes(fileSize),
  name: fileName,
}
```

Record `data_export_created` through `ActivityLogService`.

- [ ] **Step 7: Add controller tests and routes**

```ts
@Controller('education/exports')
export class DataExportController {
  @Get()
  list(@Req() req: RequestWithUser) {
    return this.dataExportService.list(req.user!.sub);
  }

  @Post()
  @ExpensiveActionRateLimit()
  create(
    @Req() req: RequestWithUser,
    @Body() dto: RequestDataExportDto,
  ) {
    return this.dataExportService.create(req.user!.sub, dto);
  }

  @Get(':exportId/download')
  async download(
    @Req() req: RequestWithUser,
    @Param('exportId') exportId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.dataExportService.getDownload(
      req.user!.sub,
      exportId,
    );
    response.setHeader('Content-Type', download.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${download.fileName}"`,
    );
    return new StreamableFile(createReadStream(download.filePath));
  }
}
```

For download, set `Content-Type`, `Content-Disposition`, and stream with
`StreamableFile`.

- [ ] **Step 8: Configure and verify**

Add:

```ts
EDUCATION_EXPORT_STORAGE_PATH: Joi.string()
  .default('exports/education')
  .description('Private local root for Education data exports'),
```

Run:

```bash
npm test -- src/modules/data-export --runInBand
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/modules/data-export \
  src/app.module.ts src/config/config.validation.ts .env.example
git commit -m "feat(export): add synchronous education data exports"
```

## Task 8: Record New Learning Events

**Files:**
- Modify: `src/modules/education/education.module.ts`
- Modify: `src/modules/education/education.service.ts`
- Modify: `src/modules/education/education.service.spec.ts`
- Modify: `src/modules/education/flashcard.service.ts`
- Modify: `src/modules/education/flashcard.service.spec.ts`
- Modify: `src/modules/education/quiz.service.ts`
- Modify: `src/modules/education/quiz.service.spec.ts`

- [ ] **Step 1: Write failing interaction tests**

For each successful operation, assert one best-effort log:

```ts
expect(activityLogService.recordBestEffort).toHaveBeenCalledWith(
  expect.objectContaining({
    userId: 7,
    action: 'lesson_completed',
    metadata: expect.objectContaining({
      lessonId: 'lesson-1',
      sourceKey: 'lesson:lesson-1:user:7',
    }),
  }),
);
```

Cover:

- course enrollment;
- lesson completion;
- vocabulary review;
- exercise submission;
- flashcard review completion;
- quiz completion.

Also test that failed domain operations do not log.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- \
  src/modules/education/education.service.spec.ts \
  src/modules/education/flashcard.service.spec.ts \
  src/modules/education/quiz.service.spec.ts \
  --runInBand
```

Expected: FAIL because services do not call ActivityLogService.

- [ ] **Step 3: Import and inject ActivityLogModule**

Add `ActivityLogModule` to `EducationModule.imports`. Inject
`ActivityLogService` into all three services.

- [ ] **Step 4: Add logs only after successful persistence**

Use stable action names:

```text
course_enrolled
lesson_completed
vocabulary_reviewed
exercises_submitted
flashcard_review_completed
quiz_completed
```

Include resource IDs, score/quality, XP, and deterministic `sourceKey`.
Call `recordBestEffort` after the primary save/transaction resolves.

- [ ] **Step 5: Verify**

```bash
npm test -- src/modules/education --runInBand
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/education
git commit -m "feat(activity): record education learning events"
```

## Task 9: Align Frontend with Real APIs

**Files:**
- Modify: `education_fe/src/api/social.api.ts`
- Modify: `education_fe/src/api/social.api.test.ts`
- Modify: `education_fe/src/api/leaderboard.api.ts`
- Modify: `education_fe/src/pages/Social.tsx`
- Create: `education_fe/src/pages/Social.test.tsx`
- Modify: `education_fe/src/pages/DataExportLogs.tsx`
- Modify: `education_fe/src/pages/user-profile/hooks/useProfileData.ts`

- [ ] **Step 1: Write failing API tests**

Assert Social and leaderboard errors are no longer silently converted into fake
empty success:

```ts
it('propagates social feed failures to TanStack Query', async () => {
  mockedGet.mockRejectedValue(new Error('network'));
  await expect(getSocialFeed()).rejects.toThrow('network');
});

it('calls the real leaderboard endpoint without fallback data', async () => {
  mockedGet.mockRejectedValue(new Error('server'));
  await expect(getLeaderboard()).rejects.toThrow('server');
});
```

- [ ] **Step 2: Run API tests and verify RED**

```bash
npm run test:run -- src/api/social.api.test.ts
```

Expected: FAIL because current APIs swallow errors.

- [ ] **Step 3: Remove silent fallbacks**

Return `response.data` directly in Social and leaderboard API functions. Let
TanStack Query own loading/error states. Preserve cache profiles.

- [ ] **Step 4: Write failing Social interaction test**

Render `Social`, expand a post with zero comments, type a comment, submit, and
assert:

```ts
expect(addComment).toHaveBeenCalledWith('post-1', 'Useful note');
expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
  queryKey: ['socialFeed'],
});
```

- [ ] **Step 5: Wire real comment and mutation behavior**

Remove the `post.comments.length > 0` gate so the first comment can be added.
Track comment drafts by post ID. Use mutations for like, bookmark, comment, and
post creation; invalidate `['socialFeed']` after success. Do not create random
local post IDs after a server failure.

- [ ] **Step 6: Use server download filename**

In `downloadExport`, parse:

```ts
const disposition = response.headers['content-disposition'];
const filename =
  disposition?.match(/filename="?([^"]+)"?/)?.[1] ??
  `edupro_export_${exportId}`;
link.setAttribute('download', filename);
```

- [ ] **Step 7: Keep profile errors actionable**

Read backend `response.data.message` for profile, password, and avatar mutation
errors instead of replacing all failures with a generic string.

- [ ] **Step 8: Verify frontend focused tests and build**

```bash
npm run test:run -- src/api/social.api.test.ts src/pages/Social.test.tsx
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit in frontend repository**

```bash
git add src/api/social.api.ts src/api/social.api.test.ts \
  src/api/leaderboard.api.ts src/pages/Social.tsx src/pages/Social.test.tsx \
  src/pages/DataExportLogs.tsx src/pages/user-profile/hooks/useProfileData.ts
git commit -m "feat(api): connect education social and data APIs"
```

## Task 10: Integration Coverage, Documentation, and Final Verification

**Files:**
- Create: `test/integration/education-platform/education-platform.e2e-spec.ts`
- Modify: `README.md`
- Modify: `API_DOCUMENTATION.md`

- [ ] **Step 1: Write failing integration tests**

Use a dedicated PostgreSQL test database and apply migrations before the suite.
Require `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USERNAME`,
`TEST_DB_PASSWORD`, and `TEST_DB_DATABASE`; abort the suite before connecting
unless `TEST_DB_DATABASE` ends in `_test`. Never reuse `DB_DATABASE`. Seed two
users plus learning records. Cover:

```text
POST /social/posts
GET /social/feed
POST /social/posts/:id/like
POST /social/posts/:id/bookmark
POST /social/posts/:id/comments
GET /social/trending
GET /education/leaderboard
GET /education/leaderboard/stats
GET /education/leaderboard/me
PATCH /auth/profile
POST /auth/change-password
POST /auth/avatar
GET /education/logs
POST /education/exports
GET /education/exports
GET /education/exports/:id/download
GET /soulie/home
```

The Soulie assertion verifies that its route still resolves through the
unchanged module; it does not alter Soulie fixtures or behavior.

- [ ] **Step 2: Run integration tests and verify RED**

```bash
npm run test:e2e -- test/integration/education-platform/education-platform.e2e-spec.ts --runInBand
```

Expected: initial FAIL until all module wiring and database behavior are
complete.

- [ ] **Step 3: Fix only integration defects**

Resolve route ordering, entity registration, ownership filters, migration SQL,
and response-shape issues exposed by the suite. Do not broaden feature scope.

- [ ] **Step 4: Update documentation**

Document:

- PostgreSQL migration command;
- new environment keys;
- avatar/export filesystem persistence requirements;
- `/social/*`, `/education/leaderboard/*`, `/education/logs`,
  `/education/exports/*`, `/auth/profile`, `/auth/change-password`, and
  `/auth/avatar`;
- explicit statement that Soulie remains a separate API.

- [ ] **Step 5: Run backend verification**

```bash
npm test -- --runInBand
npm run build
npm run migration:show
npm run test:e2e -- --runInBand
```

Expected:

- all Jest unit suites PASS;
- Nest build exits 0;
- migration is visible/applied in the intended environment;
- integration suites PASS.

Run targeted lint on touched files first:

```bash
npx eslint \
  src/modules/activity-log \
  src/modules/education-social \
  src/modules/education-leaderboard \
  src/modules/profile-storage \
  src/modules/data-export \
  src/modules/auth \
  src/modules/users \
  src/modules/education \
  src/app.module.ts src/database/data-source.ts
```

Expected: no new lint errors. Then run:

```bash
npm run lint:check
```

If the full command still reports pre-existing unrelated formatting errors,
record the exact count and paths; do not auto-format unrelated user work.

- [ ] **Step 6: Run frontend verification**

```bash
npm run test:run
npm run test:contracts
npm run build
npm run lint
```

Expected: feature-focused tests and build PASS. Fix failures caused by this
feature. Report unrelated pre-existing contract/UI test drift separately rather
than rewriting product behavior to satisfy stale string assertions.

- [ ] **Step 7: Commit integration and docs**

```bash
git add test/integration/education-platform README.md API_DOCUMENTATION.md
git commit -m "test: cover education platform API workflows"
```

## Completion Checklist

- [ ] Soulie code, routes, and tables are unchanged.
- [ ] Migration is reversible and registered for CLI use.
- [ ] Social persists posts, comments, likes, and bookmarks in PostgreSQL.
- [ ] Leaderboard derives real values without duplicated score storage.
- [ ] Profile/password/avatar APIs match the frontend contract.
- [ ] Activity logs merge new persisted events with historical projections.
- [ ] JSON/CSV exports are generated synchronously and history persists.
- [ ] Private filesystem paths never appear in API responses.
- [ ] Backend and frontend builds pass.
- [ ] New unit/controller/integration tests pass.
- [ ] Remaining pre-existing lint or stale contract failures are reported with
  exact evidence.
