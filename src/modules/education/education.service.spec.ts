import { EducationService } from './education.service';
import { EnrollmentStatus } from './entities';

const createRepository = (overrides: Record<string, unknown> = {}) => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  count: jest.fn(),
  create: jest.fn((value) => value),
  save: jest.fn((value) => Promise.resolve(value)),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
  ...overrides,
});

describe('EducationService learning plan', () => {
  it('builds today plan from enrolled course, next lesson, due vocabulary, and streak', async () => {
    const course = {
      id: 'course-1',
      title: 'English Starter',
      totalLessons: 3,
      language: { name: 'English' },
    };
    const nextLesson = {
      id: 'lesson-2',
      title: 'Daily conversations',
      courseId: 'course-1',
      estimatedMinutes: 20,
      orderIndex: 2,
    };
    const streak = {
      currentStreak: 4,
      longestStreak: 7,
      totalXp: 180,
      level: 2,
    };

    const userCourseRepository = createRepository({
      find: jest.fn().mockResolvedValue([
        {
          userId: 'user-1',
          courseId: 'course-1',
          course,
          status: EnrollmentStatus.IN_PROGRESS,
          progress: 33,
          completedLessons: 1,
          totalTimeSpent: 600,
        },
      ]),
    });
    const userLessonRepository = createRepository({
      find: jest.fn().mockResolvedValue([{ lessonId: 'lesson-1' }]),
    });
    const lessonRepository = createRepository({
      find: jest.fn().mockResolvedValue([
        {
          id: 'lesson-1',
          courseId: 'course-1',
          title: 'Intro',
          orderIndex: 1,
          estimatedMinutes: 10,
        },
        nextLesson,
      ]),
    });
    const userVocabularyRepository = createRepository({
      count: jest.fn().mockResolvedValue(12),
    });
    const userStreakRepository = createRepository({
      findOne: jest.fn().mockResolvedValue(streak),
    });
    const quizSessionRepository = createRepository({
      find: jest.fn().mockResolvedValue([]),
    });

    const service = new EducationService(
      createRepository() as any,
      createRepository() as any,
      lessonRepository as any,
      createRepository() as any,
      createRepository() as any,
      userCourseRepository as any,
      userLessonRepository as any,
      userVocabularyRepository as any,
      userStreakRepository as any,
      quizSessionRepository as any,
    );

    await expect(service.getLearningPlan('user-1')).resolves.toMatchObject({
      dailyGoal: {
        targetMinutes: 20,
        completedMinutes: 10,
        targetReviews: 20,
        completedReviews: 0,
      },
      nextLesson: {
        id: 'lesson-2',
        title: 'Daily conversations',
        courseTitle: 'English Starter',
        estimatedMinutes: 20,
      },
      dueReviews: {
        count: 12,
        recommendedLimit: 20,
      },
      streak: {
        current: 4,
        longest: 7,
        xp: 180,
        level: 2,
      },
      recommendedActions: [
        {
          type: 'lesson',
          title: 'Tiếp tục: Daily conversations',
          route: '/education/lessons/lesson-2',
          priority: 1,
        },
        {
          type: 'flashcard_review',
          title: 'Ôn 12 flashcards đến hạn',
          route: '/flashcards/review',
          priority: 2,
        },
      ],
    });
  });

  it('adds low score quizzes as weak area actions', async () => {
    const quizSessionRepository = createRepository({
      find: jest.fn().mockResolvedValue([
        {
          quizId: 'quiz-1',
          score: 55,
          quiz: { id: 'quiz-1', name: 'Grammar Basics', topic: 'Grammar' },
        },
      ]),
    });

    const service = new EducationService(
      createRepository() as any,
      createRepository() as any,
      createRepository() as any,
      createRepository() as any,
      createRepository() as any,
      createRepository({ find: jest.fn().mockResolvedValue([]) }) as any,
      createRepository({ find: jest.fn().mockResolvedValue([]) }) as any,
      createRepository({ count: jest.fn().mockResolvedValue(0) }) as any,
      createRepository({
        findOne: jest.fn().mockResolvedValue({
          currentStreak: 0,
          longestStreak: 0,
          totalXp: 0,
          level: 1,
        }),
      }) as any,
      quizSessionRepository as any,
    );

    await expect(service.getLearningPlan('user-1')).resolves.toMatchObject({
      weakQuizzes: [
        {
          quizId: 'quiz-1',
          title: 'Grammar Basics',
          topic: 'Grammar',
          score: 55,
          recommendation: 'Làm lại quiz này để củng cố Grammar',
          route: '/quiz/quiz-1',
        },
      ],
      recommendedActions: expect.arrayContaining([
        {
          type: 'quiz_retry',
          title: 'Luyện lại: Grammar Basics',
          reason: 'Điểm gần đây 55%, nên ôn lại Grammar',
          priority: 3,
          route: '/quiz/quiz-1',
        },
      ]),
    });
  });
});
