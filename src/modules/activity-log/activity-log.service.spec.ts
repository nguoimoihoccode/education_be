import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActivityLogService } from './activity-log.service';
import {
  EducationActivityLog,
  EducationActivityType,
} from './entities/activity-log.entity';

type RepositoryMock = {
  create: jest.Mock;
  save: jest.Mock;
  find: jest.Mock;
};

const createRepositoryMock = (): RepositoryMock => ({
  create: jest.fn((entity) => entity),
  save: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
});

describe('ActivityLogService', () => {
  let service: ActivityLogService;
  let activityRepository: RepositoryMock;
  let dataSource: { query: jest.Mock };

  const mockListResult = (
    data: Array<Record<string, unknown>>,
    total = data.length,
  ) => {
    dataSource.query.mockResolvedValueOnce([{ total, data }]);
  };

  beforeEach(async () => {
    activityRepository = createRepositoryMock();
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(EducationActivityLog),
          useValue: activityRepository,
        },
      ],
    }).compile();

    service = module.get(ActivityLogService);
  });

  it('records a user-owned activity event', async () => {
    activityRepository.save.mockResolvedValue({ id: 'log-1' });

    await service.record({
      userId: 7,
      type: EducationActivityType.LEARNING,
      action: 'lesson_completed',
      detail: 'Completed Intro',
      xp: 10,
      metadata: { lessonId: 'lesson-1' },
    });

    expect(activityRepository.create).toHaveBeenCalledWith({
      userId: 7,
      type: EducationActivityType.LEARNING,
      action: 'lesson_completed',
      detail: 'Completed Intro',
      xp: 10,
      metadata: { lessonId: 'lesson-1' },
    });
    expect(activityRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        action: 'lesson_completed',
      }),
    );
  });

  it('logs persistence failures in best-effort mode without throwing', async () => {
    const error = new Error('database unavailable');
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    activityRepository.save.mockRejectedValue(error);

    await expect(
      service.recordBestEffort({
        userId: 7,
        type: EducationActivityType.SOCIAL,
        action: 'social_post_created',
        detail: 'Created a post',
        metadata: { privateValue: 'must-not-be-logged' },
      }),
    ).resolves.toBeUndefined();

    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('action=social_post_created userId=7'),
      error.stack,
    );
    expect(logger.mock.calls.flat().join(' ')).not.toContain(
      'must-not-be-logged',
    );
  });

  it('uses bounded parameterized SQL for count and page data', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        total: 3,
        data: [
          {
            id: 'quiz:session-2',
            createdAt: '2026-06-12T10:00:00.000Z',
            type: EducationActivityType.LEARNING,
            action: 'quiz_completed',
            detail: 'Completed quiz: HSK Checkpoint',
            xp: 0,
          },
        ],
      },
    ]);

    const result = await service.list(7, {
      page: 2,
      limit: 2,
      type: EducationActivityType.LEARNING,
      search: '  QuIz  ',
    });

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const [pageSql, pageParams] = dataSource.query.mock.calls[0] as [
      string,
      unknown[],
    ];

    expect(pageSql).toContain('WITH activity_rows AS');
    expect(pageSql).toContain('UNION ALL');
    expect(pageSql).toContain('COUNT(*)::int AS total');
    expect(pageSql).toContain('jsonb_agg');
    expect(pageSql).toContain('LIMIT $4 OFFSET $5');
    expect(pageParams).toEqual([
      7,
      EducationActivityType.LEARNING,
      'quiz',
      2,
      2,
    ]);
    expect(pageSql).not.toContain('"answers"');
    expect(pageSql).not.toContain('"results"');
    expect(pageSql).not.toContain('AS kind');
    expect(activityRepository.find).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: [
        {
          id: 'quiz:session-2',
          createdAt: '2026-06-12T10:00:00.000Z',
          type: EducationActivityType.LEARNING,
          action: 'quiz_completed',
          detail: 'Completed quiz: HSK Checkpoint',
          xp: 0,
        },
      ],
      meta: { total: 3, page: 2, totalPages: 2 },
    });
    expect(result.data[0]).not.toHaveProperty('sourceKey');
  });

  it('keeps the total when a requested page has no rows', async () => {
    dataSource.query.mockResolvedValueOnce([{ total: 5, data: [] }]);

    const result = await service.list(7, { page: 4, limit: 2 });

    const pageSql = dataSource.query.mock.calls[0][0] as string;
    expect(pageSql).toContain('filtered_count AS');
    expect(pageSql).toContain('LEFT JOIN page_rows ON true');
    expect(result).toEqual({
      data: [],
      meta: { total: 5, page: 4, totalPages: 3 },
    });
  });

  it.each(['%', '_'])(
    'treats the %s search character as a literal value',
    async (search) => {
      mockListResult([
        {
          id: 'persisted-literal',
          sourceKey: 'persisted:persisted-literal',
          createdAt: '2026-06-12T10:00:00.000Z',
          type: EducationActivityType.SYSTEM,
          action: 'profile_updated',
          detail: `Contains ${search} literally`,
          xp: 0,
        },
      ]);

      await service.list(7, { page: 1, limit: 20, search: ` ${search} ` });

      const [pageSql, pageParams] = dataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(pageSql).toMatch(
        /POSITION\(\s*\$3::text IN LOWER\(action \|\| ' ' \|\| detail\)\s*\) > 0/,
      );
      expect(pageSql).not.toContain(' LIKE ');
      expect(pageParams).toEqual([7, null, search, 20, 0]);
    },
  );

  it('uses the canonical lesson source key while keeping the user lesson row ID public', async () => {
    mockListResult([]);

    await service.list(7, { page: 1, limit: 20 });

    const pageSql = dataSource.query.mock.calls[0][0] as string;
    expect(pageSql).toContain(
      "'lesson:' || user_lesson.lesson_id::text || ':user:' || $1::text",
    );
    expect(pageSql).toContain("'lesson:' || user_lesson.id::text AS id");
  });

  it('deduplicates repeated persisted source keys by retaining the newest persisted row', async () => {
    mockListResult([
      {
        id: 'persisted-newest',
        sourceKey: 'quiz:session-1',
        createdAt: '2026-06-12T10:00:00.000Z',
        type: EducationActivityType.LEARNING,
        action: 'quiz_completed',
        detail: 'Newest persisted event',
        xp: 5,
      },
    ]);

    const result = await service.list(7, { page: 1, limit: 20 });

    const pageSql = dataSource.query.mock.calls[0][0] as string;
    expect(pageSql).toContain("THEN BTRIM(activity.metadata->>'sourceKey')");
    expect(pageSql).toContain('PARTITION BY source_key');
    expect(pageSql).toContain(
      'ORDER BY source_priority ASC, created_at DESC, id ASC',
    );
    expect(pageSql).toContain('WHERE source_rank = 1');
    expect(result.data.map(({ id }) => id)).toEqual(['persisted-newest']);
  });

  it.each(['empty', 'numeric', 'object'])(
    'synthesizes distinct persisted keys for %s metadata sourceKey values',
    async () => {
      mockListResult([
        {
          id: 'persisted-a',
          sourceKey: 'persisted:persisted-a',
          createdAt: '2026-06-12T10:00:00.000Z',
          type: EducationActivityType.SYSTEM,
          action: 'profile_updated',
          detail: 'Persisted A',
          xp: 0,
        },
        {
          id: 'persisted-b',
          sourceKey: 'persisted:persisted-b',
          createdAt: '2026-06-12T09:00:00.000Z',
          type: EducationActivityType.SYSTEM,
          action: 'profile_updated',
          detail: 'Persisted B',
          xp: 0,
        },
      ]);

      const result = await service.list(7, { page: 1, limit: 20 });

      const pageSql = dataSource.query.mock.calls[0][0] as string;
      expect(pageSql).toContain(
        "jsonb_typeof(activity.metadata->'sourceKey') = 'string'",
      );
      expect(pageSql).toContain("BTRIM(activity.metadata->>'sourceKey') <> ''");
      expect(pageSql).toContain("ELSE 'persisted:' || activity.id::text");
      expect(result.data.map(({ id }) => id)).toEqual([
        'persisted-a',
        'persisted-b',
      ]);
    },
  );

  it('uses a deterministic tie break for shuffled equal-timestamp rows', async () => {
    mockListResult([
      {
        id: 'persisted-a',
        sourceKey: 'persisted:persisted-a',
        createdAt: '2026-06-12T10:00:00.000Z',
        type: EducationActivityType.SYSTEM,
        action: 'profile_updated',
        detail: 'Persisted A',
        xp: 0,
      },
      {
        id: 'persisted-b',
        sourceKey: 'persisted:persisted-b',
        createdAt: '2026-06-12T10:00:00.000Z',
        type: EducationActivityType.SYSTEM,
        action: 'profile_updated',
        detail: 'Persisted B',
        xp: 0,
      },
      {
        id: 'lesson:z',
        sourceKey: 'lesson:lesson-z:user:7',
        createdAt: '2026-06-12T10:00:00.000Z',
        type: EducationActivityType.LEARNING,
        action: 'lesson_completed',
        detail: 'Completed lesson: Z',
        xp: 0,
      },
    ]);

    const result = await service.list(7, { page: 1, limit: 20 });

    const pageSql = dataSource.query.mock.calls[0][0] as string;
    expect(pageSql).toContain(
      'ORDER BY created_at DESC, source_priority ASC, id ASC',
    );
    expect(result.data.map(({ id }) => id)).toEqual([
      'persisted-a',
      'persisted-b',
      'lesson:z',
    ]);
  });

  it('projects only normalized fields and reads the quiz name directly', async () => {
    mockListResult([]);

    await service.list(7, { page: 1, limit: 20 });

    const pageSql = dataSource.query.mock.calls[0][0] as string;
    expect(pageSql).toContain('quiz.name');
    expect(pageSql).not.toContain('quiz.title');
    expect(pageSql).toContain('review_session."xpEarned" AS xp');
    expect(pageSql).toContain(
      "'flashcard:' || review_session.id::text AS source_key",
    );
  });
});
