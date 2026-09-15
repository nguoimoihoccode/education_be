import { LessonContentService } from './lesson-content.service';
import { Course, UserCourse } from '../entities';

const createRepository = (
  overrides: Record<string, unknown> = {},
): Record<string, any> => {
  const repository: Record<string, any> = {
    count: jest.fn(),
    create: jest.fn((value) => value),
    find: jest.fn(),
    findOne: jest.fn(),
    increment: jest.fn(),
    save: jest.fn((value) => Promise.resolve(value)),
    update: jest.fn(),
  };
  // createLesson runs a MAX(orderIndex) query builder chain; give the default
  // a chainable stub (tests may override createQueryBuilder entirely).
  repository.createQueryBuilder = jest.fn(() => {
    const builder: any = {};
    for (const method of ['where', 'select']) {
      builder[method] = jest.fn().mockReturnValue(builder);
    }
    builder.getRawOne = jest.fn().mockResolvedValue({ max: 2 });
    return builder;
  });
  repository.manager = {
    transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
      work({ getRepository: () => repository }),
    ),
  };
  Object.assign(repository, overrides);
  return repository;
};

describe('LessonContentService transactions', () => {
  const createService = () => {
    const lessonRepository = createRepository();
    const courseRepository = createRepository();
    const exerciseRepository = createRepository();
    const userLessonRepository = createRepository();
    const userCourseRepository = createRepository();
    const courseCatalogService = {
      getCourseById: jest
        .fn()
        .mockResolvedValue({ id: 'course-1', totalLessons: 2 }),
    };
    const streakService = {
      updateStreak: jest.fn().mockResolvedValue({ userId: 'user-1' }),
      recordActivity: jest.fn(),
    };
    const service = new LessonContentService(
      lessonRepository as never,
      courseRepository as never,
      exerciseRepository as never,
      userLessonRepository as never,
      userCourseRepository as never,
      courseCatalogService as never,
      streakService as never,
    );
    return {
      service,
      lessonRepository,
      courseRepository,
      userLessonRepository,
      userCourseRepository,
      courseCatalogService,
      streakService,
    };
  };

  it('routes every completeLesson write through one transaction', async () => {
    const {
      service,
      lessonRepository,
      userLessonRepository,
      userCourseRepository,
      streakService,
    } = createService();
    lessonRepository.findOne.mockResolvedValue({
      id: 'lesson-1',
      courseId: 'course-1',
    });
    // Lesson row already exists; the count query feeds course progress.
    userLessonRepository.findOne.mockResolvedValue({
      userId: 'user-1',
      lessonId: 'lesson-1',
      completed: false,
      timeSpent: 60,
      attempts: 1,
    });
    userLessonRepository.count.mockResolvedValue(2);
    // Route each transaction entity to its mock repository.
    userLessonRepository.manager = {
      transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
        work({
          getRepository: (entity: unknown) =>
            entity === UserCourse ? userCourseRepository : userLessonRepository,
        }),
      ),
    };

    await service.completeLesson('user-1', 'lesson-1', { timeSpent: 120 });

    expect(userLessonRepository.save).toHaveBeenCalledTimes(1);
    expect(userCourseRepository.increment).toHaveBeenCalledWith(
      { userId: 'user-1', courseId: 'course-1' },
      'totalTimeSpent',
      120,
    );
    expect(userCourseRepository.update).toHaveBeenCalledWith(
      { userId: 'user-1', courseId: 'course-1' },
      expect.objectContaining({ completedLessons: 2, progress: 100 }),
    );
    // The streak update joins the same transaction via the runner.
    expect(streakService.updateStreak).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ getRepository: expect.any(Function) }),
    );
  });

  it('saves a new lesson and refreshes course.totalLessons in one transaction', async () => {
    const { service, lessonRepository, courseRepository } = createService();
    lessonRepository.count.mockResolvedValue(3);
    // Route the transaction back to the two mocks involved.
    lessonRepository.manager = {
      transaction: jest.fn(async (work: (manager: unknown) => unknown) =>
        work({
          getRepository: (entity: unknown) =>
            entity === Course ? courseRepository : lessonRepository,
        }),
      ),
    };

    const lesson = await service.createLesson({
      courseId: 'course-1',
      title: 'New lesson',
    } as never);

    expect(lesson.orderIndex).toBe(3);
    expect(lessonRepository.save).toHaveBeenCalledTimes(1);
    expect(courseRepository.update).toHaveBeenCalledWith(
      'course-1',
      expect.objectContaining({ totalLessons: 3 }),
    );
  });

  it('still updates course progress without a transaction runner (public helper)', async () => {
    const {
      service,
      userLessonRepository,
      userCourseRepository,
      courseCatalogService,
    } = createService();
    userLessonRepository.count.mockResolvedValue(1);
    courseCatalogService.getCourseById.mockResolvedValue({
      id: 'course-1',
      totalLessons: 2,
    });

    await service.updateCourseProgress('user-1', 'course-1');

    expect(userCourseRepository.update).toHaveBeenCalledWith(
      { userId: 'user-1', courseId: 'course-1' },
      expect.objectContaining({ progress: 50 }),
    );
  });
});
