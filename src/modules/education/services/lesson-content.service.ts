import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Lesson,
  Course,
  Exercise,
  UserLesson,
  UserCourse,
  EnrollmentStatus,
} from '../entities';
import {
  CreateLessonDto,
  CompleteLessonDto,
  CreateExerciseDto,
  SubmitExercisesDto,
  SubmitExercisesResultDto,
  ExerciseResultDto,
} from '../dto';
import { CourseCatalogService } from './course-catalog.service';
import { StreakService } from './streak.service';

@Injectable()
export class LessonContentService {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(Exercise)
    private readonly exerciseRepository: Repository<Exercise>,
    @InjectRepository(UserLesson)
    private readonly userLessonRepository: Repository<UserLesson>,
    @InjectRepository(UserCourse)
    private readonly userCourseRepository: Repository<UserCourse>,
    private readonly courseCatalogService: CourseCatalogService,
    private readonly streakService: StreakService,
  ) {}

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
    const course = await this.courseCatalogService.getCourseById(dto.courseId);

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
    await this.streakService.updateStreak(userId);

    return savedUserLesson;
  }

  async updateCourseLessonCount(courseId: string): Promise<void> {
    const count = await this.lessonRepository.count({
      where: { courseId, active: true },
    });
    await this.courseRepository.update(courseId, { totalLessons: count });
  }

  async updateCourseProgress(userId: string, courseId: string): Promise<void> {
    const course = await this.courseCatalogService.getCourseById(courseId);
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
    await this.streakService.updateStreak(userId);

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
}
