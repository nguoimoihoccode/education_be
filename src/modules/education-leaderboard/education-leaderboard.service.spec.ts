import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import {
  LeaderboardCategory,
  LeaderboardPeriod,
  LeaderboardQueryDto,
} from './dto/leaderboard-query.dto';
import {
  EducationLeaderboardService,
  getLeaderboardBadge,
  getLeaderboardOrderExpression,
  getPeriodCutoff,
} from './education-leaderboard.service';

describe('LeaderboardQueryDto', () => {
  it('defaults to the frontend initial filter and validates pagination', async () => {
    const dto = plainToInstance(LeaderboardQueryDto, {});

    expect(dto).toMatchObject({
      period: LeaderboardPeriod.WEEK,
      category: LeaderboardCategory.XP,
      page: 1,
      limit: 20,
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects invalid enums, oversized search, and limits above 100', async () => {
    const dto = plainToInstance(LeaderboardQueryDto, {
      period: 'year',
      category: 'raw sql',
      search: 'x'.repeat(101),
      limit: 101,
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['period', 'category', 'search', 'limit']),
    );
  });
});

describe('education leaderboard helpers', () => {
  it('computes Monday 00:00 UTC for the current calendar week', () => {
    expect(
      getPeriodCutoff(
        LeaderboardPeriod.WEEK,
        new Date('2026-06-10T18:45:00.000Z'),
      ),
    ).toEqual(new Date('2026-06-08T00:00:00.000Z'));
    expect(
      getPeriodCutoff(
        LeaderboardPeriod.WEEK,
        new Date('2026-06-14T23:59:59.000Z'),
      ),
    ).toEqual(new Date('2026-06-08T00:00:00.000Z'));
  });

  it('computes day one 00:00 UTC for month and no cutoff for all time', () => {
    expect(
      getPeriodCutoff(
        LeaderboardPeriod.MONTH,
        new Date('2026-06-30T23:59:59.000Z'),
      ),
    ).toEqual(new Date('2026-06-01T00:00:00.000Z'));
    expect(
      getPeriodCutoff(
        LeaderboardPeriod.ALL,
        new Date('2026-06-30T23:59:59.000Z'),
      ),
    ).toBeNull();
  });

  it.each([
    [LeaderboardCategory.XP, 'm.xp'],
    [LeaderboardCategory.STREAK, 'm.streak'],
    [LeaderboardCategory.LESSONS, 'm.lessons_completed'],
    [LeaderboardCategory.QUIZ, 'm.quiz_score'],
  ])('maps %s to a fixed SQL expression', (category, expression) => {
    expect(getLeaderboardOrderExpression(category)).toBe(expression);
  });

  it('falls back to the XP expression instead of accepting raw input', () => {
    expect(
      getLeaderboardOrderExpression(
        'm.xp; DROP TABLE users' as LeaderboardCategory,
      ),
    ).toBe('m.xp');
  });

  it('derives deterministic badges compatible with Education Social', () => {
    expect(getLeaderboardBadge(20, 0)).toBe('trophy');
    expect(getLeaderboardBadge(4, 7)).toBe('streak');
    expect(getLeaderboardBadge(1, 0)).toBe('learner');
  });
});

describe('EducationLeaderboardService', () => {
  const now = new Date('2026-06-10T18:45:00.000Z');
  let query: jest.Mock;
  let service: EducationLeaderboardService;

  beforeEach(() => {
    query = jest.fn();
    service = new EducationLeaderboardService(
      { query } as unknown as DataSource,
      () => now,
    );
  });

  it.each([
    [LeaderboardCategory.XP, 'm.xp'],
    [LeaderboardCategory.STREAK, 'm.streak'],
    [LeaderboardCategory.LESSONS, 'm.lessons_completed'],
    [LeaderboardCategory.QUIZ, 'm.quiz_score'],
  ])(
    'uses the whitelisted %s ordering expression in parameterized SQL',
    async (category, expression) => {
      query.mockResolvedValue([{ data: [], total: 0, currentUser: null }]);

      await service.list(7, {
        category,
        period: LeaderboardPeriod.WEEK,
        page: 1,
        limit: 20,
        search: 'alice',
        sortBy: 'malicious',
        sortOrder: 'ASC',
      });

      const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain(`${expression} DESC, m.xp DESC, m.user_id ASC`);
      expect(sql).not.toContain('malicious');
      expect(sql).not.toContain('alice');
      expect(parameters).toEqual([
        '2026-06-08T00:00:00.000Z',
        'alice',
        20,
        0,
        7,
      ]);
    },
  );

  it('ranks active users globally before search and bounded pagination', async () => {
    query.mockResolvedValue([{ data: [], total: 0, currentUser: null }]);

    await service.list(7, {
      category: LeaderboardCategory.XP,
      period: LeaderboardPeriod.ALL,
      page: 3,
      limit: 10,
      search: 'Lan',
    });

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    const rankedIndex = sql.indexOf('ranked AS');
    const searchedIndex = sql.indexOf('searched AS');

    expect(sql).toContain('ROW_NUMBER() OVER');
    expect(sql).toContain('m.user_id ASC');
    expect(sql).toContain(
      'm.xp <> 0 OR m.streak <> 0 OR m.lessons_completed <> 0',
    );
    expect(sql).toContain('OR m.quiz_score <> 0');
    expect(sql).not.toContain('m.quiz_earned <> 0 OR m.quiz_total <> 0');
    expect(rankedIndex).toBeGreaterThan(-1);
    expect(searchedIndex).toBeGreaterThan(rankedIndex);
    expect(sql).toContain('LIMIT $3 OFFSET $4');
    expect(parameters).toEqual([null, 'Lan', 10, 20, 7]);
  });

  it.each(['%', '_'])(
    'treats the %s search character literally after global ranking',
    async (search) => {
      query.mockResolvedValue([{ data: [], total: 0, currentUser: null }]);

      await service.list(7, {
        category: LeaderboardCategory.XP,
        period: LeaderboardPeriod.ALL,
        page: 1,
        limit: 20,
        search,
      });

      const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
      const rankedIndex = sql.indexOf('ranked AS');
      const searchedIndex = sql.indexOf('searched AS');

      expect(sql).toContain(
        'POSITION(LOWER($2::text) IN LOWER(r.display_name)) > 0',
      );
      expect(sql).not.toContain('ILIKE');
      expect(rankedIndex).toBeGreaterThan(-1);
      expect(searchedIndex).toBeGreaterThan(rankedIndex);
      expect(parameters[1]).toBe(search);
    },
  );

  it('applies period cutoff only to completed lesson and quiz metrics', async () => {
    query.mockResolvedValue([{ data: [], total: 0, currentUser: null }]);

    await service.list(7, {
      category: LeaderboardCategory.XP,
      period: LeaderboardPeriod.MONTH,
      page: 1,
      limit: 20,
    });

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];

    expect(parameters[0]).toBe('2026-06-01T00:00:00.000Z');
    expect(sql.match(/\$1::timestamptz/g)).toHaveLength(4);
    expect(sql).toContain('ul.completed_at >=');
    expect(sql).toContain('qs."completedAt" >=');
    expect(sql).toContain('COALESCE(s.total_xp, 0)');
    expect(sql).toContain('COALESCE(s.current_streak, 0)');
    expect(
      sql.slice(
        sql.indexOf('streak_metrics AS'),
        sql.indexOf('lesson_metrics AS'),
      ),
    ).not.toContain('$1');
  });

  it('computes quiz score from summed points and uses stable unique ranks', async () => {
    query.mockResolvedValue([{ data: [], total: 0, currentUser: null }]);

    await service.list(7, {
      category: LeaderboardCategory.QUIZ,
      period: LeaderboardPeriod.ALL,
      page: 1,
      limit: 20,
    });

    const [sql] = query.mock.calls[0] as [string];

    expect(sql).toMatch(
      /ROUND\(\s*100\.0 \* q\.quiz_earned \/ NULLIF\(q\.quiz_total, 0\)\s*\)/,
    );
    expect(sql).toContain('WHERE qs.completed = TRUE');
    expect(sql).toMatch(
      /ROW_NUMBER\(\) OVER \(\s*ORDER BY m\.quiz_score DESC, m\.xp DESC, m\.user_id ASC\s*\)/,
    );
  });

  it('normalizes PostgreSQL raw values into the exact frontend response', async () => {
    const rawRow = {
      id: 7,
      rank: '2',
      displayName: 'Alice',
      avatar: null,
      xp: '1500',
      streak: '8',
      lessonsCompleted: '12',
      quizScore: '87',
      level: '4',
    };
    query.mockResolvedValue([
      {
        data: JSON.stringify([rawRow]),
        total: '21',
        currentUser: JSON.stringify(rawRow),
      },
    ]);

    const result = await service.list(7, {
      category: LeaderboardCategory.XP,
      period: LeaderboardPeriod.WEEK,
      page: 2,
      limit: 20,
    });

    expect(result).toEqual({
      data: [
        {
          id: '7',
          rank: 2,
          displayName: 'Alice',
          xp: 1500,
          streak: 8,
          lessonsCompleted: 12,
          quizScore: 87,
          level: 4,
          badge: 'streak',
          change: 'same',
          changeAmount: 0,
        },
      ],
      meta: {
        page: 2,
        limit: 20,
        total: 21,
        totalPages: 2,
      },
      currentUser: {
        id: '7',
        rank: 2,
        displayName: 'Alice',
        xp: 1500,
        streak: 8,
        lessonsCompleted: 12,
        quizScore: 87,
        level: 4,
        badge: 'streak',
        change: 'same',
        changeAmount: 0,
      },
    });
  });

  it('keeps total metadata and current user correct for an empty page', async () => {
    query.mockResolvedValue([
      {
        data: [],
        total: '3',
        currentUser: {
          id: '7',
          rank: '1',
          displayName: 'Current',
          avatar: '/avatar.png',
          xp: '100',
          streak: '1',
          lessonsCompleted: '0',
          quizScore: '0',
          level: '2',
        },
      },
    ]);

    const result = await service.list(7, {
      category: LeaderboardCategory.XP,
      period: LeaderboardPeriod.ALL,
      page: 3,
      limit: 2,
    });

    expect(result.data).toEqual([]);
    expect(result.meta).toEqual({
      page: 3,
      limit: 2,
      total: 3,
      totalPages: 2,
    });
    expect(result.currentUser).toMatchObject({
      id: '7',
      rank: 1,
      avatar: '/avatar.png',
    });
  });

  it('returns no current user when search excludes them', async () => {
    query.mockResolvedValue([{ data: [], total: 0, currentUser: null }]);

    const result = await service.list(7, {
      category: LeaderboardCategory.XP,
      period: LeaderboardPeriod.ALL,
      page: 1,
      limit: 20,
      search: 'someone else',
    });

    expect(result.currentUser).toBeUndefined();
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('FROM searched current_match');
  });

  it('returns zero-safe global stats and converts 5400 seconds to 1.5 hours', async () => {
    query.mockResolvedValue([
      {
        totalXp: '1200',
        totalLessons: '8',
        totalQuizzesPassed: '3',
        totalHoursStudied: '1.5',
      },
    ]);

    await expect(service.stats()).resolves.toEqual({
      totalXp: 1200,
      totalLessons: 8,
      totalQuizzesPassed: 3,
      totalHoursStudied: 1.5,
    });

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('FROM edu_user_courses');
    expect(sql).toContain('/ 3600.0');
    expect(sql).not.toContain('SUM(ul.time_spent)');
  });

  it('normalizes empty aggregate stats to numeric zeros', async () => {
    query.mockResolvedValue([
      {
        totalXp: null,
        totalLessons: null,
        totalQuizzesPassed: null,
        totalHoursStudied: null,
      },
    ]);

    await expect(service.stats()).resolves.toEqual({
      totalXp: 0,
      totalLessons: 0,
      totalQuizzesPassed: 0,
      totalHoursStudied: 0,
    });
  });

  it('returns the active user all-time XP rank', async () => {
    query.mockResolvedValue([
      {
        row: {
          id: '7',
          rank: '3',
          displayName: 'Alice',
          avatar: null,
          xp: '900',
          streak: '2',
          lessonsCompleted: '5',
          quizScore: '80',
          level: '3',
        },
      },
    ]);

    await expect(service.me(7)).resolves.toMatchObject({
      id: '7',
      rank: 3,
      xp: 900,
      badge: 'learner',
    });

    const [sql, parameters] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(
      /ROW_NUMBER\(\) OVER \(\s*ORDER BY m\.xp DESC, m\.xp DESC, m\.user_id ASC\s*\)/,
    );
    expect(parameters).toEqual([null, 7]);
  });

  it('keeps a user with only a completed zero-score quiz unranked', async () => {
    query.mockResolvedValue([
      {
        row: {
          id: 9,
          rank: 0,
          displayName: 'newbie',
          avatar: '/new.png',
          xp: 0,
          streak: 0,
          lessonsCompleted: 0,
          quizScore: 0,
          level: 1,
        },
      },
    ]);

    await expect(service.me(9)).resolves.toEqual({
      id: '9',
      rank: 0,
      displayName: 'newbie',
      avatar: '/new.png',
      xp: 0,
      streak: 0,
      lessonsCompleted: 0,
      quizScore: 0,
      level: 1,
      badge: 'learner',
      change: 'same',
      changeAmount: 0,
    });

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain(
      'm.xp <> 0 OR m.streak <> 0 OR m.lessons_completed <> 0',
    );
    expect(sql).toContain('OR m.quiz_score <> 0');
    expect(sql).not.toContain('m.quiz_earned <> 0 OR m.quiz_total <> 0');
  });

  it('throws 404 when the current user does not exist', async () => {
    query.mockResolvedValue([{ row: null }]);

    await expect(service.me(404)).rejects.toMatchObject({
      status: 404,
    });
  });
});
