import { ConflictException } from '@nestjs/common';
import { UserCourseService, isDuplicateKeyError } from './user-course.service';

describe('UserCourseService.enrollCourse', () => {
  const createService = (existingEnrollment: unknown) => {
    const userCourseRepository: Record<string, any> = {
      create: jest.fn((value) => value),
      findOne: jest.fn().mockResolvedValue(existingEnrollment),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const userLessonRepository: Record<string, any> = {
      count: jest.fn(),
    };
    const userVocabularyRepository: Record<string, any> = {
      count: jest.fn(),
    };
    const courseCatalogService = {
      getCourseById: jest.fn().mockResolvedValue({ id: 'course-1' }),
    };
    const streakService = { getUserStreak: jest.fn() };
    const service = new UserCourseService(
      userCourseRepository as never,
      userLessonRepository as never,
      userVocabularyRepository as never,
      courseCatalogService as never,
      streakService as never,
    );
    return { service, userCourseRepository };
  };

  it('enrolls a first-time learner', async () => {
    const { service, userCourseRepository } = createService(null);

    const enrolled = await service.enrollCourse('user-1', 'course-1');

    expect(enrolled).toMatchObject({
      userId: 'user-1',
      courseId: 'course-1',
    });
    expect(userCourseRepository.save).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate enrollment before writing', async () => {
    const { service, userCourseRepository } = createService({
      userId: 'user-1',
      courseId: 'course-1',
    });

    await expect(service.enrollCourse('user-1', 'course-1')).rejects.toThrow(
      ConflictException,
    );
    expect(userCourseRepository.save).not.toHaveBeenCalled();
  });

  it('translates a concurrent-enrollment unique violation into a 409', async () => {
    const { service, userCourseRepository } = createService(null);
    // Two concurrent requests both pass the findOne check; the loser hits
    // the (userId, courseId) unique constraint on save.
    userCourseRepository.save.mockRejectedValue({ code: '23505' });

    await expect(service.enrollCourse('user-1', 'course-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('rethrows unrelated save failures', async () => {
    const { service, userCourseRepository } = createService(null);
    userCourseRepository.save.mockRejectedValue(
      Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }),
    );

    await expect(service.enrollCourse('user-1', 'course-1')).rejects.toThrow(
      'connection refused',
    );
  });
});

describe('isDuplicateKeyError', () => {
  it('recognizes PostgreSQL and MySQL unique violation codes on both surfaces', () => {
    expect(isDuplicateKeyError({ code: '23505' })).toBe(true);
    expect(isDuplicateKeyError({ driverError: { code: '23505' } })).toBe(true);
    expect(isDuplicateKeyError({ code: 'ER_DUP_ENTRY' })).toBe(true);
    expect(isDuplicateKeyError({ code: 'ECONNREFUSED' })).toBe(false);
    expect(isDuplicateKeyError(new Error('boom'))).toBe(false);
  });
});
