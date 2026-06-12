import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EducationActivityType } from './entities/activity-log.entity';
import { EducationActivityLog } from './entities/activity-log.entity';
import { QuizSession } from '../education/entities/quiz-session.entity';
import { ReviewSession } from '../education/entities/review-session.entity';
import { UserLesson } from '../education/entities/user-lesson.entity';
import { ActivityLogService } from './activity-log.service';

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

  beforeEach(async () => {
    activityRepository = createRepositoryMock();
    userLessonRepository = createRepositoryMock();
    quizSessionRepository = createRepositoryMock();
    reviewSessionRepository = createRepositoryMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityLogService,
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

  it('projects completed lesson, quiz, and flashcard history with deterministic IDs', async () => {
    userLessonRepository.find.mockResolvedValue([
      {
        id: 'lesson-record',
        completedAt: new Date('2026-06-01T10:00:00.000Z'),
        lesson: { title: 'Intro' },
      },
      {
        id: 'lesson-without-time',
        completedAt: null,
        lesson: { title: 'Ignored' },
      },
    ]);
    quizSessionRepository.find.mockResolvedValue([
      {
        id: 'quiz-record',
        completedAt: new Date('2026-06-02T10:00:00.000Z'),
        quiz: { name: 'HSK Checkpoint' },
      },
    ]);
    reviewSessionRepository.find.mockResolvedValue([
      {
        id: 'review-record',
        completedAt: new Date('2026-06-03T10:00:00.000Z'),
        deck: { name: 'HSK 1 Words' },
        xpEarned: 12,
      },
    ]);

    const result = await service.list(7, { page: 1, limit: 20 });

    expect(userLessonRepository.find).toHaveBeenCalledWith({
      where: { userId: '7', completed: true },
      relations: ['lesson'],
    });
    expect(quizSessionRepository.find).toHaveBeenCalledWith({
      where: { userId: 7, completed: true },
      relations: ['quiz'],
    });
    expect(reviewSessionRepository.find).toHaveBeenCalledWith({
      where: { userId: 7, completed: true },
      relations: ['deck'],
    });
    expect(result.data).toEqual([
      {
        id: 'flashcard:review-record',
        createdAt: '2026-06-03T10:00:00.000Z',
        type: EducationActivityType.PRACTICE,
        action: 'flashcard_review_completed',
        detail: expect.stringContaining('HSK 1 Words'),
        xp: 12,
      },
      {
        id: 'quiz:quiz-record',
        createdAt: '2026-06-02T10:00:00.000Z',
        type: EducationActivityType.LEARNING,
        action: 'quiz_completed',
        detail: expect.stringContaining('HSK Checkpoint'),
        xp: 0,
      },
      {
        id: 'lesson:lesson-record',
        createdAt: '2026-06-01T10:00:00.000Z',
        type: EducationActivityType.LEARNING,
        action: 'lesson_completed',
        detail: expect.stringContaining('Intro'),
        xp: 0,
      },
    ]);
  });

  it('merges persisted and projected rows in stable descending timestamp order', async () => {
    activityRepository.find.mockResolvedValue([
      {
        id: 'persisted-first',
        createdAt: new Date('2026-06-04T10:00:00.000Z'),
        type: EducationActivityType.SYSTEM,
        action: 'profile_updated',
        detail: 'Updated profile',
        xp: 0,
        metadata: { internal: true },
      },
      {
        id: 'persisted-second',
        createdAt: new Date('2026-06-04T10:00:00.000Z'),
        type: EducationActivityType.ACHIEVEMENT,
        action: 'badge_earned',
        detail: 'Earned a badge',
        xp: 5,
      },
    ]);
    userLessonRepository.find.mockResolvedValue([
      {
        id: 'older-lesson',
        completedAt: new Date('2026-06-03T10:00:00.000Z'),
        lesson: { title: 'Older lesson' },
      },
    ]);

    const result = await service.list(7, { page: 1, limit: 20 });

    expect(result.data.map(({ id }) => id)).toEqual([
      'persisted-first',
      'persisted-second',
      'lesson:older-lesson',
    ]);
    expect(result.data[0]).not.toHaveProperty('metadata');
  });

  it('suppresses a projected row when a persisted source key matches it', async () => {
    activityRepository.find.mockResolvedValue([
      {
        id: 'persisted-lesson',
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        type: EducationActivityType.LEARNING,
        action: 'lesson_completed',
        detail: 'Persisted lesson completion',
        xp: 20,
        metadata: { sourceKey: 'lesson:lesson-record' },
      },
    ]);
    userLessonRepository.find.mockResolvedValue([
      {
        id: 'lesson-record',
        completedAt: new Date('2026-06-01T10:00:00.000Z'),
        lesson: { title: 'Intro' },
      },
    ]);

    const result = await service.list(7, { page: 1, limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('persisted-lesson');
  });

  it('filters by activity type', async () => {
    activityRepository.find.mockResolvedValue([
      {
        id: 'system-log',
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        type: EducationActivityType.SYSTEM,
        action: 'profile_updated',
        detail: 'Updated profile',
        xp: 0,
      },
      {
        id: 'social-log',
        createdAt: new Date('2026-06-04T10:00:00.000Z'),
        type: EducationActivityType.SOCIAL,
        action: 'social_post_created',
        detail: 'Created a post',
        xp: 0,
      },
    ]);

    const result = await service.list(7, {
      page: 1,
      limit: 20,
      type: EducationActivityType.SOCIAL,
    });

    expect(result.data.map(({ id }) => id)).toEqual(['social-log']);
  });

  it('searches action and detail case-insensitively', async () => {
    activityRepository.find.mockResolvedValue([
      {
        id: 'action-match',
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        type: EducationActivityType.LEARNING,
        action: 'QUIZ_COMPLETED',
        detail: 'Finished an assessment',
        xp: 0,
      },
      {
        id: 'detail-match',
        createdAt: new Date('2026-06-04T10:00:00.000Z'),
        type: EducationActivityType.PRACTICE,
        action: 'review_completed',
        detail: 'Practiced Quiz vocabulary',
        xp: 0,
      },
      {
        id: 'no-match',
        createdAt: new Date('2026-06-03T10:00:00.000Z'),
        type: EducationActivityType.SYSTEM,
        action: 'profile_updated',
        detail: 'Updated profile',
        xp: 0,
      },
    ]);

    const result = await service.list(7, {
      page: 1,
      limit: 20,
      search: 'qUiZ',
    });

    expect(result.data.map(({ id }) => id)).toEqual([
      'action-match',
      'detail-match',
    ]);
  });

  it('paginates after merge, filtering, and deduplication with correct meta', async () => {
    activityRepository.find.mockResolvedValue([
      {
        id: 'persisted-newest',
        createdAt: new Date('2026-06-05T10:00:00.000Z'),
        type: EducationActivityType.LEARNING,
        action: 'lesson_completed',
        detail: 'Completed Newest',
        xp: 0,
        metadata: { sourceKey: 'lesson:duplicate' },
      },
      {
        id: 'filtered-system',
        createdAt: new Date('2026-06-04T10:00:00.000Z'),
        type: EducationActivityType.SYSTEM,
        action: 'profile_updated',
        detail: 'Updated profile',
        xp: 0,
      },
    ]);
    userLessonRepository.find.mockResolvedValue([
      {
        id: 'duplicate',
        completedAt: new Date('2026-06-03T10:00:00.000Z'),
        lesson: { title: 'Duplicate' },
      },
      {
        id: 'middle',
        completedAt: new Date('2026-06-02T10:00:00.000Z'),
        lesson: { title: 'Middle' },
      },
      {
        id: 'oldest',
        completedAt: new Date('2026-06-01T10:00:00.000Z'),
        lesson: { title: 'Oldest' },
      },
    ]);

    const result = await service.list(7, {
      page: 2,
      limit: 1,
      type: EducationActivityType.LEARNING,
      search: 'completed',
    });

    expect(result.data.map(({ id }) => id)).toEqual(['lesson:middle']);
    expect(result.meta).toEqual({
      total: 3,
      page: 2,
      totalPages: 3,
    });
  });
});
