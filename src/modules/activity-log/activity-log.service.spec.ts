import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QuizSession } from '../education/entities/quiz-session.entity';
import { ReviewSession } from '../education/entities/review-session.entity';
import { UserLesson } from '../education/entities/user-lesson.entity';
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
  let userLessonRepository: RepositoryMock;
  let quizSessionRepository: RepositoryMock;
  let reviewSessionRepository: RepositoryMock;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    activityRepository = createRepositoryMock();
    userLessonRepository = createRepositoryMock();
    quizSessionRepository = createRepositoryMock();
    reviewSessionRepository = createRepositoryMock();
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(EducationActivityLog),
          useValue: activityRepository,
        },
        {
          provide: getRepositoryToken(UserLesson),
          useValue: userLessonRepository,
        },
        {
          provide: getRepositoryToken(QuizSession),
          useValue: quizSessionRepository,
        },
        {
          provide: getRepositoryToken(ReviewSession),
          useValue: reviewSessionRepository,
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
    dataSource.query
      .mockResolvedValueOnce([{ total: '3' }])
      .mockResolvedValueOnce([
        {
          id: 'quiz:session-2',
          sourceKey: 'quiz:session-2',
          createdAt: new Date('2026-06-12T10:00:00.000Z'),
          type: EducationActivityType.LEARNING,
          action: 'quiz_completed',
          detail: 'Completed quiz: HSK Checkpoint',
          xp: 0,
        },
      ]);

    const result = await service.list(7, {
      page: 2,
      limit: 2,
      type: EducationActivityType.LEARNING,
      search: '  QuIz  ',
    });

    expect(dataSource.query).toHaveBeenCalledTimes(2);
    const [countSql, countParams] = dataSource.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    const [pageSql, pageParams] = dataSource.query.mock.calls[1] as [
      string,
      unknown[],
    ];

    expect(countSql).toContain('WITH activity_rows AS');
    expect(countSql).toContain('UNION ALL');
    expect(countSql).toContain('SELECT COUNT(*)::int AS total');
    expect(countSql).toContain('LOWER(action ||');
    expect(countSql).not.toMatch(/\bLIMIT\b|\bOFFSET\b/);
    expect(countParams).toEqual([7, EducationActivityType.LEARNING, '%quiz%']);

    expect(pageSql).toContain('LIMIT $4 OFFSET $5');
    expect(pageParams).toEqual([
      7,
      EducationActivityType.LEARNING,
      '%quiz%',
      2,
      2,
    ]);
    expect(pageSql).not.toContain('"answers"');
    expect(pageSql).not.toContain('"results"');
    expect(pageSql).not.toContain('AS kind');
    expect(activityRepository.find).not.toHaveBeenCalled();
    expect(userLessonRepository.find).not.toHaveBeenCalled();
    expect(quizSessionRepository.find).not.toHaveBeenCalled();
    expect(reviewSessionRepository.find).not.toHaveBeenCalled();
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

  it('uses the canonical lesson source key while keeping the user lesson row ID public', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await service.list(7, { page: 1, limit: 20 });

    const pageSql = dataSource.query.mock.calls[1][0] as string;
    expect(pageSql).toContain(
      "'lesson:' || user_lesson.lesson_id::text || ':user:' || $1::text",
    );
    expect(pageSql).toContain("'lesson:' || user_lesson.id::text AS id");
  });

  it('deduplicates repeated persisted source keys by retaining the newest persisted row', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
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

    const pageSql = dataSource.query.mock.calls[1][0] as string;
    expect(pageSql).toContain(
      "COALESCE(activity.metadata->>'sourceKey', 'persisted:' || activity.id::text)",
    );
    expect(pageSql).toContain('PARTITION BY source_key');
    expect(pageSql).toContain(
      'ORDER BY source_priority ASC, created_at DESC, id ASC',
    );
    expect(pageSql).toContain('WHERE source_rank = 1');
    expect(result.data.map(({ id }) => id)).toEqual(['persisted-newest']);
  });

  it('uses a deterministic tie break for shuffled equal-timestamp rows', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ total: 3 }])
      .mockResolvedValueOnce([
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

    const pageSql = dataSource.query.mock.calls[1][0] as string;
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
    dataSource.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await service.list(7, { page: 1, limit: 20 });

    const pageSql = dataSource.query.mock.calls[1][0] as string;
    expect(pageSql).toContain('quiz.name');
    expect(pageSql).not.toContain('quiz.title');
    expect(pageSql).toContain('review_session."xpEarned" AS xp');
    expect(pageSql).toContain(
      "'flashcard:' || review_session.id::text AS source_key",
    );
  });
});
