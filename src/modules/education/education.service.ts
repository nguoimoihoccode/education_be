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
}
