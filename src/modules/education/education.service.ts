import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
  Language,
  Course,
  Lesson,
  Vocabulary,
  Exercise,
  UserCourse,
  UserLesson,
  UserVocabulary,
  UserStreak,
  QuizSession,
  DailyLearningTask,
  EnrollmentStatus,
  VocabularyStatus,
} from './entities';
import {
  GetCoursesDto,
  CreateCourseDto,
  UpdateCourseDto,
  CreateLessonDto,
  UpdateLessonDto,
  CompleteLessonDto,
  CreateVocabularyDto,
  ReviewVocabularyDto,
  CreateExerciseDto,
  SubmitExercisesDto,
  SubmitExercisesResultDto,
  ExerciseResultDto,
} from './dto';
import { calculateSrsReview, nextReviewDate } from './domain/srs.policy';

export type TodayPlanTaskType =
  | 'continue_lesson'
  | 'review_flashcards'
  | 'quick_quiz'
  | 'fix_mistakes';

export interface TodayPlanTask {
  id: string;
  type: TodayPlanTaskType;
  title: string;
  description: string;
  ctaLabel: string;
  targetUrl: string;
  estimatedMinutes: number;
  completed: boolean;
  priority: number;
}

export interface TodayPlan {
  date: string;
  completedTasks: number;
  totalTasks: number;
  estimatedMinutes: number;
  streak: {
    current: number;
    longest: number;
  };
  tasks: TodayPlanTask[];
}

export type TodayLearningHubTaskType =
  | 'continue_lesson'
  | 'review_vocabulary'
  | 'quick_quiz'
  | 'fix_mistakes';

export interface TodayLearningHubTask {
  id: string;
  type: TodayLearningHubTaskType;
  title: string;
  description: string;
  ctaLabel: string;
  targetUrl: string;
  estimatedMinutes: number;
  completed: boolean;
  priority: number;
  metadata?: Record<string, unknown>;
}

export interface TodayLearningHub {
  date: string;
  dailyGoalMinutes: number;
  minutesLearnedToday: number;
  xpToday: number;
  completedTasks: number;
  totalTasks: number;
  streak: {
    current: number;
    longest: number;
    isAtRisk: boolean;
  };
  primaryTask?: TodayLearningHubTask;
  tasks: TodayLearningHubTask[];
}

const getTodayDateKey = (): string => {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
};

@Injectable()
export class EducationService {
  constructor(
    @InjectRepository(Language)
    private languageRepository: Repository<Language>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(Lesson)
    private lessonRepository: Repository<Lesson>,
    @InjectRepository(Vocabulary)
    private vocabularyRepository: Repository<Vocabulary>,
    @InjectRepository(Exercise)
    private exerciseRepository: Repository<Exercise>,
    @InjectRepository(UserCourse)
    private userCourseRepository: Repository<UserCourse>,
    @InjectRepository(UserLesson)
    private userLessonRepository: Repository<UserLesson>,
    @InjectRepository(UserVocabulary)
    private userVocabularyRepository: Repository<UserVocabulary>,
    @InjectRepository(UserStreak)
    private userStreakRepository: Repository<UserStreak>,
    @InjectRepository(QuizSession)
    private quizSessionRepository: Repository<QuizSession>,
    @InjectRepository(DailyLearningTask)
    private dailyLearningTaskRepository: Repository<DailyLearningTask>,
  ) {}

  // ==================== LANGUAGES ====================
  async getLanguages(): Promise<Language[]> {
    return this.languageRepository.find({
      where: { active: true },
      order: { order: 'ASC', name: 'ASC' },
    });
  }

  async getLanguageById(id: string): Promise<Language> {
    const language = await this.languageRepository.findOne({ where: { id } });
    if (!language) {
      throw new NotFoundException('Language not found');
    }
    return language;
  }

  async resolveLanguageId(languageCode?: string): Promise<string> {
    const code = (languageCode || 'en').toLowerCase();
    const language = await this.languageRepository.findOne({ where: { code } });

    if (!language) {
      throw new NotFoundException(`Language not found for code: ${code}`);
    }

    return language.id;
  }

  // ==================== COURSES ====================
  async getCourses(dto: GetCoursesDto): Promise<{
    courses: Course[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { languageId, level, page = 1, limit = 10 } = dto;

    const queryBuilder = this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.language', 'language')
      .where('course.active = :active', { active: true });

    if (languageId) {
      queryBuilder.andWhere('course.languageId = :languageId', { languageId });
    }

    if (level) {
      queryBuilder.andWhere('course.level = :level', { level });
    }

    queryBuilder
      .orderBy('course.order', 'ASC')
      .addOrderBy('course.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [courses, total] = await queryBuilder.getManyAndCount();
    const totalPages = Math.ceil(total / limit);

    return { courses, total, page, limit, totalPages };
  }

  async getCourseById(id: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { id },
      relations: ['language', 'lessons'],
    });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course;
  }

  async createCourse(dto: CreateCourseDto): Promise<Course> {
    const language = await this.getLanguageById(dto.languageId);
    const course = this.courseRepository.create({
      ...dto,
      language,
    });
    return this.courseRepository.save(course);
  }

  async updateCourse(id: string, dto: UpdateCourseDto): Promise<Course> {
    const course = await this.getCourseById(id);
    Object.assign(course, dto);
    return this.courseRepository.save(course);
  }

  // ==================== ENROLLMENT ====================
  async enrollCourse(userId: string, courseId: string): Promise<UserCourse> {
    const course = await this.getCourseById(courseId);

    const existingEnrollment = await this.userCourseRepository.findOne({
      where: { userId, courseId },
    });

    if (existingEnrollment) {
      throw new ConflictException('Already enrolled in this course');
    }

    const userCourse = this.userCourseRepository.create({
      userId,
      courseId: course.id,
      status: EnrollmentStatus.ENROLLED,
    });

    return this.userCourseRepository.save(userCourse);
  }

  async getUserCourses(userId: string): Promise<UserCourse[]> {
    return this.userCourseRepository.find({
      where: { userId },
      relations: ['course', 'course.language'],
      order: { updatedAt: 'DESC' },
    });
  }

  // ==================== LESSONS ====================
  async getLessonsByCourse(
    courseId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    lessons: Lesson[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [lessons, total] = await this.lessonRepository.findAndCount({
      where: { courseId, active: true },
      order: { orderIndex: 'ASC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return { lessons, total, page, limit, totalPages };
  }

  async getLessonById(id: string): Promise<Lesson> {
    const lesson = await this.lessonRepository.findOne({
      where: { id },
      relations: ['course', 'vocabularies', 'exercises'],
    });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    return lesson;
  }

  async createLesson(dto: CreateLessonDto): Promise<Lesson> {
    const course = await this.getCourseById(dto.courseId);

    // Get max order index
    const maxOrder = await this.lessonRepository
      .createQueryBuilder('lesson')
      .where('lesson.courseId = :courseId', { courseId: dto.courseId })
      .select('MAX(lesson.orderIndex)', 'max')
      .getRawOne();

    const lesson = this.lessonRepository.create({
      ...dto,
      course,
      orderIndex: (maxOrder?.max || 0) + 1,
    });

    const savedLesson = await this.lessonRepository.save(lesson);

    // Update course total lessons
    await this.updateCourseLessonCount(dto.courseId);

    return savedLesson;
  }

  async completeLesson(
    userId: string,
    lessonId: string,
    dto: CompleteLessonDto,
  ): Promise<UserLesson> {
    const lesson = await this.getLessonById(lessonId);

    let userLesson = await this.userLessonRepository.findOne({
      where: { userId, lessonId },
    });

    if (userLesson) {
      userLesson.completed = true;
      userLesson.completedAt = new Date();
      userLesson.timeSpent += dto.timeSpent || 0;
      userLesson.attempts += 1;
      if (dto.exerciseScore !== undefined) {
        userLesson.exerciseScore = dto.exerciseScore;
      }
    } else {
      userLesson = this.userLessonRepository.create({
        userId,
        lessonId,
        completed: true,
        completedAt: new Date(),
        timeSpent: dto.timeSpent || 0,
        exerciseScore: dto.exerciseScore,
        attempts: 1,
      });
    }

    const savedUserLesson = await this.userLessonRepository.save(userLesson);

    if (dto.timeSpent && dto.timeSpent > 0) {
      await this.userCourseRepository.increment(
        { userId, courseId: lesson.courseId },
        'totalTimeSpent',
        dto.timeSpent,
      );
    }

    // Update course progress
    await this.updateCourseProgress(userId, lesson.courseId);

    // Update streak
    await this.updateStreak(userId);

    return savedUserLesson;
  }

  private async updateCourseLessonCount(courseId: string): Promise<void> {
    const count = await this.lessonRepository.count({
      where: { courseId, active: true },
    });
    await this.courseRepository.update(courseId, { totalLessons: count });
  }

  private async updateCourseProgress(
    userId: string,
    courseId: string,
  ): Promise<void> {
    const course = await this.getCourseById(courseId);
    const completedLessons = await this.userLessonRepository.count({
      where: {
        userId,
        completed: true,
        lesson: { courseId },
      },
    });

    const progress =
      course.totalLessons > 0
        ? (completedLessons / course.totalLessons) * 100
        : 0;

    await this.userCourseRepository.update(
      { userId, courseId },
      {
        completedLessons,
        progress,
        status:
          progress >= 100
            ? EnrollmentStatus.COMPLETED
            : EnrollmentStatus.IN_PROGRESS,
        ...(progress >= 100 ? { completedAt: new Date() } : {}),
      },
    );
  }

  // ==================== VOCABULARY ====================
  async getVocabularyByLesson(
    lessonId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    vocabulary: Vocabulary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [vocabulary, total] = await this.vocabularyRepository.findAndCount({
      where: { lessonId },
      order: { orderIndex: 'ASC' },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return { vocabulary, total, page, limit, totalPages };
  }

  async createVocabulary(dto: CreateVocabularyDto): Promise<Vocabulary> {
    const lesson = await this.getLessonById(dto.lessonId);

    const maxOrder = await this.vocabularyRepository
      .createQueryBuilder('vocab')
      .where('vocab.lessonId = :lessonId', { lessonId: dto.lessonId })
      .select('MAX(vocab.orderIndex)', 'max')
      .getRawOne();

    const vocabulary = this.vocabularyRepository.create({
      ...dto,
      lesson,
      orderIndex: (maxOrder?.max || 0) + 1,
    });

    return this.vocabularyRepository.save(vocabulary);
  }

  async getVocabularyToReview(
    userId: string,
    limit = 20,
  ): Promise<Vocabulary[]> {
    const now = new Date();

    const userVocabs = await this.userVocabularyRepository.find({
      where: {
        userId,
        nextReview: LessThanOrEqual(now),
      },
      relations: ['vocabulary'],
      order: { nextReview: 'ASC' },
      take: limit,
    });

    return userVocabs.map((uv) => uv.vocabulary);
  }

  async reviewVocabulary(
    userId: string,
    vocabularyId: string,
    dto: ReviewVocabularyDto,
  ): Promise<UserVocabulary> {
    let userVocab = await this.userVocabularyRepository.findOne({
      where: { userId, vocabularyId },
    });

    if (!userVocab) {
      userVocab = this.userVocabularyRepository.create({
        userId,
        vocabularyId,
      });
    }

    const { easeFactor, interval, repetitions, status } = calculateSrsReview({
      quality: dto.quality,
      easeFactor: Number(userVocab.easeFactor),
      interval: userVocab.interval,
      repetitions: userVocab.repetitions,
    });

    userVocab.easeFactor = easeFactor;
    userVocab.interval = interval;
    userVocab.repetitions = repetitions;
    userVocab.status = status as VocabularyStatus;
    userVocab.lastReviewed = new Date();
    userVocab.nextReview = nextReviewDate(new Date(), interval);

    if (dto.quality >= 3) {
      userVocab.correctCount += 1;
    } else {
      userVocab.wrongCount += 1;
    }

    return this.userVocabularyRepository.save(userVocab);
  }

  // ==================== EXERCISES ====================
  async getExercisesByLesson(lessonId: string): Promise<Exercise[]> {
    return this.exerciseRepository.find({
      where: { lessonId },
      order: { orderIndex: 'ASC' },
    });
  }

  async createExercise(dto: CreateExerciseDto): Promise<Exercise> {
    const lesson = await this.getLessonById(dto.lessonId);

    const maxOrder = await this.exerciseRepository
      .createQueryBuilder('ex')
      .where('ex.lessonId = :lessonId', { lessonId: dto.lessonId })
      .select('MAX(ex.orderIndex)', 'max')
      .getRawOne();

    const exercise = this.exerciseRepository.create({
      ...dto,
      lesson,
      orderIndex: (maxOrder?.max || 0) + 1,
    });

    return this.exerciseRepository.save(exercise);
  }

  async submitExercises(
    userId: string,
    lessonId: string,
    dto: SubmitExercisesDto,
  ): Promise<SubmitExercisesResultDto> {
    const exercises = await this.getExercisesByLesson(lessonId);
    const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

    const results: ExerciseResultDto[] = [];
    let totalPoints = 0;
    let earnedPoints = 0;
    let correctCount = 0;

    for (const answer of dto.answers) {
      const exercise = exerciseMap.get(answer.exerciseId);
      if (!exercise) continue;

      const isCorrect = this.checkAnswer(exercise, answer.answer);
      totalPoints += exercise.points;

      if (isCorrect) {
        earnedPoints += exercise.points;
        correctCount += 1;
      }

      results.push({
        exerciseId: exercise.id,
        correct: isCorrect,
        userAnswer: answer.answer,
        correctAnswer: exercise.answer,
        explanation: exercise.explanation,
        pointsEarned: isCorrect ? exercise.points : 0,
      });
    }

    const score =
      dto.answers.length > 0 ? (correctCount / dto.answers.length) * 100 : 0;

    // Update streak
    await this.updateStreak(userId);

    return {
      totalExercises: dto.answers.length,
      correctAnswers: correctCount,
      wrongAnswers: dto.answers.length - correctCount,
      score,
      totalPoints,
      earnedPoints,
      results,
    };
  }

  private checkAnswer(exercise: Exercise, userAnswer: any): boolean {
    const correctAnswer = exercise.answer;

    // Simple comparison - can be extended for different exercise types
    if (typeof correctAnswer === 'string' && typeof userAnswer === 'string') {
      return (
        correctAnswer.toLowerCase().trim() === userAnswer.toLowerCase().trim()
      );
    }

    if (Array.isArray(correctAnswer) && Array.isArray(userAnswer)) {
      return (
        JSON.stringify(correctAnswer.sort()) ===
        JSON.stringify(userAnswer.sort())
      );
    }

    return JSON.stringify(correctAnswer) === JSON.stringify(userAnswer);
  }

  // ==================== STREAK & PROGRESS ====================
  async getUserStreak(userId: string): Promise<UserStreak> {
    let streak = await this.userStreakRepository.findOne({ where: { userId } });

    if (!streak) {
      streak = this.userStreakRepository.create({ userId });
      streak = await this.userStreakRepository.save(streak);
    }

    return streak;
  }

  private async updateStreak(userId: string): Promise<UserStreak> {
    const streak = await this.getUserStreak(userId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastActivity = streak.lastActivityDate
      ? new Date(streak.lastActivityDate)
      : null;
    lastActivity?.setHours(0, 0, 0, 0);

    if (!lastActivity) {
      // First activity
      streak.currentStreak = 1;
      streak.longestStreak = 1;
      streak.totalDays = 1;
    } else {
      const daysDiff = Math.floor(
        (today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysDiff === 0) {
        // Same day - no change
      } else if (daysDiff === 1) {
        // Consecutive day
        streak.currentStreak += 1;
        streak.totalDays += 1;
        if (streak.currentStreak > streak.longestStreak) {
          streak.longestStreak = streak.currentStreak;
        }
      } else {
        // Streak broken
        streak.currentStreak = 1;
        streak.totalDays += 1;
      }
    }

    streak.lastActivityDate = today;
    streak.totalXp += 10; // Base XP for activity

    // Level up every 100 XP
    streak.level = Math.floor(streak.totalXp / 100) + 1;

    return this.userStreakRepository.save(streak);
  }

  async getUserProgress(userId: string): Promise<{
    streak: UserStreak;
    enrolledCourses: number;
    completedCourses: number;
    completedLessons: number;
    learnedVocabularies: number;
    masteredVocabularies: number;
  }> {
    const streak = await this.getUserStreak(userId);

    const enrolledCourses = await this.userCourseRepository.count({
      where: { userId },
    });

    const completedCourses = await this.userCourseRepository.count({
      where: { userId, status: EnrollmentStatus.COMPLETED },
    });

    const completedLessons = await this.userLessonRepository.count({
      where: { userId, completed: true },
    });

    const learnedVocabularies = await this.userVocabularyRepository.count({
      where: { userId },
    });

    const masteredVocabularies = await this.userVocabularyRepository.count({
      where: { userId, status: VocabularyStatus.MASTERED },
    });

    return {
      streak,
      enrolledCourses,
      completedCourses,
      completedLessons,
      learnedVocabularies,
      masteredVocabularies,
    };
  }

  async getLearningPlan(userId: string): Promise<{
    dailyGoal: {
      targetMinutes: number;
      completedMinutes: number;
      targetReviews: number;
      completedReviews: number;
    };
    nextLesson: {
      id: string;
      title: string;
      courseTitle: string;
      estimatedMinutes: number;
      route: string;
    } | null;
    dueReviews: { count: number; recommendedLimit: number };
    weakQuizzes: Array<{
      quizId: string;
      title: string;
      topic: string;
      score: number;
      recommendation: string;
      route: string;
    }>;
    streak: { current: number; longest: number; xp: number; level: number };
    recommendedActions: Array<{
      type: 'lesson' | 'flashcard_review' | 'quiz_retry';
      title: string;
      reason: string;
      priority: number;
      route: string;
    }>;
  }> {
    const targetMinutes = 20;
    const targetReviews = 20;
    const enrollments = await this.userCourseRepository.find({
      where: { userId },
      relations: ['course', 'course.language'],
      order: { updatedAt: 'DESC' },
    });
    const activeEnrollment = enrollments.find(
      (enrollment) =>
        enrollment.status === EnrollmentStatus.ENROLLED ||
        enrollment.status === EnrollmentStatus.IN_PROGRESS,
    );

    let nextLesson: {
      id: string;
      title: string;
      courseTitle: string;
      estimatedMinutes: number;
      route: string;
    } | null = null;

    if (activeEnrollment) {
      const [lessons, completedLessons] = await Promise.all([
        this.lessonRepository.find({
          where: { courseId: activeEnrollment.courseId, active: true },
          order: { orderIndex: 'ASC' },
        }),
        this.userLessonRepository.find({
          where: { userId, completed: true },
        }),
      ]);
      const completedLessonIds = new Set(
        completedLessons.map((lesson) => lesson.lessonId),
      );
      const lesson = lessons.find((item) => !completedLessonIds.has(item.id));

      if (lesson) {
        nextLesson = {
          id: lesson.id,
          title: lesson.title,
          courseTitle: activeEnrollment.course?.title || 'Khóa học của bạn',
          estimatedMinutes: lesson.estimatedMinutes || targetMinutes,
          route: `/education/lessons/${lesson.id}`,
        };
      }
    }

    const [dueReviewCount, streak] = await Promise.all([
      this.userVocabularyRepository.count({
        where: { userId, nextReview: LessThanOrEqual(new Date()) },
      }),
      this.userStreakRepository.findOne({ where: { userId } }),
    ]);
    const numericUserId = Number(userId);
    const weakQuizSessions = await this.quizSessionRepository.find({
      where: {
        userId: Number.isNaN(numericUserId) ? (userId as any) : numericUserId,
        completed: true,
      },
      relations: ['quiz'],
      order: { completedAt: 'DESC' },
      take: 10,
    });
    const weakQuizzes = weakQuizSessions
      .filter((session) => Number(session.score) < 70 && session.quiz)
      .filter(
        (session, index, sessions) =>
          sessions.findIndex((item) => item.quizId === session.quizId) ===
          index,
      )
      .slice(0, 3)
      .map((session) => {
        const topic = session.quiz.topic || 'chủ đề này';
        return {
          quizId: session.quizId,
          title: session.quiz.name,
          topic,
          score: Math.round(Number(session.score)),
          recommendation: `Làm lại quiz này để củng cố ${topic}`,
          route: `/quiz/${session.quizId}`,
        };
      });
    const completedMinutes = Math.min(
      targetMinutes,
      Math.floor(
        enrollments.reduce(
          (total, enrollment) => total + (enrollment.totalTimeSpent || 0),
          0,
        ) / 60,
      ),
    );
    const todayCompletedTasks = await this.dailyLearningTaskRepository.find({
      where: { userId, date: getTodayDateKey(), completed: true },
    });
    const completedReviews = (todayCompletedTasks ?? []).some(
      (task) =>
        task.taskType === 'review_flashcards' ||
        task.taskType === 'review_vocabulary',
    )
      ? targetReviews
      : 0;
    const recommendedActions = [];

    if (nextLesson) {
      recommendedActions.push({
        type: 'lesson' as const,
        title: `Tiếp tục: ${nextLesson.title}`,
        reason: `Bài tiếp theo trong ${nextLesson.courseTitle}`,
        priority: 1,
        route: nextLesson.route,
      });
    }

    if (dueReviewCount > 0) {
      recommendedActions.push({
        type: 'flashcard_review' as const,
        title: `Ôn ${dueReviewCount} flashcards đến hạn`,
        reason: 'Ôn đúng hạn giúp bạn nhớ lâu hơn',
        priority: 2,
        route: '/flashcards/review',
      });
    }

    weakQuizzes.forEach((quiz, index) => {
      recommendedActions.push({
        type: 'quiz_retry' as const,
        title: `Luyện lại: ${quiz.title}`,
        reason: `Điểm gần đây ${quiz.score}%, nên ôn lại ${quiz.topic}`,
        priority: 3 + index,
        route: quiz.route,
      });
    });

    if (recommendedActions.length === 0) {
      recommendedActions.push({
        type: 'quiz_retry' as const,
        title: 'Luyện quiz ngắn',
        reason: 'Duy trì nhịp học bằng một bài luyện tập nhanh',
        priority: 3,
        route: '/quiz',
      });
    }

    return {
      dailyGoal: {
        targetMinutes,
        completedMinutes,
        targetReviews,
        completedReviews,
      },
      nextLesson,
      dueReviews: {
        count: dueReviewCount,
        recommendedLimit: targetReviews,
      },
      weakQuizzes,
      streak: {
        current: streak?.currentStreak || 0,
        longest: streak?.longestStreak || 0,
        xp: streak?.totalXp || 0,
        level: streak?.level || 1,
      },
      recommendedActions: recommendedActions.sort(
        (a, b) => a.priority - b.priority,
      ),
    };
  }

  async getTodayPlan(userId: string): Promise<TodayPlan> {
    const learningPlan = await this.getLearningPlan(userId);
    const tasks: TodayPlanTask[] = [];

    if (learningPlan.nextLesson) {
      tasks.push({
        id: `continue-lesson-${learningPlan.nextLesson.id}`,
        type: 'continue_lesson',
        title: `Tiếp tục: ${learningPlan.nextLesson.title}`,
        description: `Bài tiếp theo trong ${learningPlan.nextLesson.courseTitle}`,
        ctaLabel: 'Học tiếp',
        targetUrl: learningPlan.nextLesson.route,
        estimatedMinutes: learningPlan.nextLesson.estimatedMinutes,
        completed: false,
        priority: 1,
      });
    }

    if (learningPlan.dueReviews.count > 0) {
      tasks.push({
        id: 'review-flashcards',
        type: 'review_flashcards',
        title: `Ôn ${learningPlan.dueReviews.count} flashcards đến hạn`,
        description: 'Ôn đúng hạn giúp bạn nhớ lâu hơn.',
        ctaLabel: 'Ôn flashcards',
        targetUrl: '/flashcards/review',
        estimatedMinutes: Math.min(
          15,
          Math.max(5, Math.ceil(learningPlan.dueReviews.count / 2)),
        ),
        completed: false,
        priority: 2,
      });
    }

    learningPlan.weakQuizzes.slice(0, 1).forEach((quiz) => {
      tasks.push({
        id: `fix-mistakes-${quiz.quizId}`,
        type: 'fix_mistakes',
        title: `Sửa lỗi: ${quiz.title}`,
        description: quiz.recommendation,
        ctaLabel: 'Luyện lại',
        targetUrl: quiz.route,
        estimatedMinutes: 10,
        completed: false,
        priority: 3,
      });
    });

    tasks.push({
      id: 'quick-quiz',
      type: 'quick_quiz',
      title: 'Làm quiz ngắn',
      description: 'Duy trì nhịp học bằng một bài luyện tập nhanh.',
      ctaLabel: 'Mở quiz',
      targetUrl: '/quiz',
      estimatedMinutes: 10,
      completed: false,
      priority: tasks.length ? 4 : 1,
    });

    const date = getTodayDateKey();
    const sortedTasks = tasks
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 4);
    const completionRows = await this.dailyLearningTaskRepository.find({
      where: { userId, date, completed: true },
    });
    const completedTaskIds = new Set(completionRows.map((task) => task.taskId));
    const tasksWithCompletion = sortedTasks.map((task) => ({
      ...task,
      completed: completedTaskIds.has(task.id),
    }));
    const completedTasks = tasksWithCompletion.filter(
      (task) => task.completed,
    ).length;

    return {
      date,
      completedTasks,
      totalTasks: tasksWithCompletion.length,
      estimatedMinutes: tasksWithCompletion.reduce(
        (total, task) => total + task.estimatedMinutes,
        0,
      ),
      streak: {
        current: learningPlan.streak.current,
        longest: learningPlan.streak.longest,
      },
      tasks: tasksWithCompletion,
    };
  }

  async getTodayLearningHub(userId: string): Promise<TodayLearningHub> {
    const learningPlan = await this.getLearningPlan(userId);
    const tasks: TodayLearningHubTask[] = [];

    if (learningPlan.nextLesson) {
      tasks.push({
        id: `continue-lesson-${learningPlan.nextLesson.id}`,
        type: 'continue_lesson',
        title: `Tiếp tục: ${learningPlan.nextLesson.title}`,
        description: `Bài tiếp theo trong ${learningPlan.nextLesson.courseTitle}`,
        ctaLabel: 'Học tiếp',
        targetUrl: learningPlan.nextLesson.route,
        estimatedMinutes: learningPlan.nextLesson.estimatedMinutes,
        completed: false,
        priority: 1,
      });
    }

    if (learningPlan.dueReviews.count > 0) {
      tasks.push({
        id: 'review-vocabulary',
        type: 'review_vocabulary',
        title: `Ôn ${learningPlan.dueReviews.count} từ vựng đến hạn`,
        description: 'Ôn đúng hạn giúp bạn nhớ lâu hơn.',
        ctaLabel: 'Ôn từ vựng',
        targetUrl: '/flashcards/review',
        estimatedMinutes: Math.min(
          15,
          Math.max(5, Math.ceil(learningPlan.dueReviews.count / 2)),
        ),
        completed: false,
        priority: 2,
      });
    }

    learningPlan.weakQuizzes.slice(0, 1).forEach((quiz) => {
      tasks.push({
        id: `fix-mistakes-${quiz.quizId}`,
        type: 'fix_mistakes',
        title: `Sửa lỗi: ${quiz.title}`,
        description: quiz.recommendation,
        ctaLabel: 'Luyện lại',
        targetUrl: quiz.route,
        estimatedMinutes: 10,
        completed: false,
        priority: 3,
        metadata: { quizId: quiz.quizId, score: quiz.score, topic: quiz.topic },
      });
    });

    tasks.push({
      id: 'quick-quiz',
      type: 'quick_quiz',
      title: 'Làm quiz ngắn',
      description: 'Duy trì nhịp học bằng một bài luyện tập nhanh.',
      ctaLabel: 'Mở quiz',
      targetUrl: '/quiz',
      estimatedMinutes: 10,
      completed: false,
      priority: tasks.length ? 4 : 1,
    });

    const date = getTodayDateKey();
    const sortedTasks = tasks.sort((a, b) => a.priority - b.priority).slice(0, 4);
    const completionRows = await this.dailyLearningTaskRepository.find({
      where: { userId, date, completed: true },
    });
    const completedTaskIds = new Set(
      completionRows.flatMap((task) =>
        task.taskId === 'review-flashcards'
          ? [task.taskId, 'review-vocabulary']
          : [task.taskId],
      ),
    );
    const tasksWithCompletion = sortedTasks.map((task) => ({
      ...task,
      completed: completedTaskIds.has(task.id),
    }));
    const completedTasks = tasksWithCompletion.filter((task) => task.completed).length;
    const dailyGoalMinutes = 10;

    const minutesLearnedToday = Math.min(
      dailyGoalMinutes,
      tasksWithCompletion
        .filter((task) => task.completed)
        .reduce((total, task) => total + task.estimatedMinutes, 0),
    );

    return {
      date,
      dailyGoalMinutes,
      minutesLearnedToday,
      xpToday: 0,
      completedTasks,
      totalTasks: tasksWithCompletion.length,
      streak: {
        current: learningPlan.streak.current,
        longest: learningPlan.streak.longest,
        isAtRisk:
          completedTasks === 0 &&
          minutesLearnedToday === 0 &&
          learningPlan.streak.current > 0,
      },
      primaryTask: tasksWithCompletion.find((task) => !task.completed),
      tasks: tasksWithCompletion,
    };
  }

  async getTodayRecommendations(userId: string) {
    return this.getLearningPlan(userId);
  }

  async markTodayPlanTaskComplete(userId: string, taskId: string) {
    const todayHub = await this.getTodayLearningHub(userId);
    let task: TodayLearningHubTask | TodayPlanTask | undefined =
      todayHub.tasks.find((item) => item.id === taskId);
    let date = todayHub.date;

    if (!task) {
      const todayPlan = await this.getTodayPlan(userId);
      task = todayPlan.tasks.find((item) => item.id === taskId);
      date = todayPlan.date;
    }

    if (!task) {
      throw new NotFoundException('Today plan task not found');
    }

    const completion = {
      userId,
      date,
      taskId,
      taskType: task.type,
      targetUrl: task.targetUrl,
      completed: true,
      completedAt: new Date(),
    };

    await this.dailyLearningTaskRepository.upsert(completion, [
      'userId',
      'date',
      'taskId',
    ]);

    return this.dailyLearningTaskRepository.findOne({
      where: { userId, date, taskId },
    });
  }

  async markTodayPlanTasksCompleteByTarget(userId: string, targetUrl: string) {
    const todayPlan = await this.getTodayPlan(userId);
    const matchingTasks = todayPlan.tasks.filter(
      (task) => task.targetUrl === targetUrl,
    );

    for (const task of matchingTasks) {
      await this.markTodayPlanTaskComplete(userId, task.id);
    }
  }

  async markTodayPlanTasksCompleteByType(
    userId: string,
    taskTypes: Array<TodayPlanTaskType | TodayLearningHubTaskType>,
  ) {
    const todayHub = await this.getTodayLearningHub(userId);
    const todayPlan = await this.getTodayPlan(userId);
    const matchingTasksById = new Map<
      string,
      TodayLearningHubTask | TodayPlanTask
    >();

    for (const task of [...todayHub.tasks, ...todayPlan.tasks]) {
      if (taskTypes.includes(task.type)) {
        matchingTasksById.set(task.id, task);
      }
    }

    for (const task of matchingTasksById.values()) {
      await this.markTodayPlanTaskComplete(userId, task.id);
    }
  }
}
