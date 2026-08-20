import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
} from './entities';
import {
  GetCoursesDto,
  CreateCourseDto,
  UpdateCourseDto,
  CreateLessonDto,
  CompleteLessonDto,
  CreateVocabularyDto,
  ReviewVocabularyDto,
  CreateExerciseDto,
  SubmitExercisesDto,
  SubmitExercisesResultDto,
} from './dto';
import { AiService } from '../ai/ai.service';
import { CourseCatalogService } from './services/course-catalog.service';
import { StreakService } from './services/streak.service';
import { UserCourseService } from './services/user-course.service';
import { LessonContentService } from './services/lesson-content.service';
import { VocabularyService } from './services/vocabulary.service';
import { LearningPlanService } from './services/learning-plan.service';
import type {
  TodayPlan,
  TodayLearningHub,
  TodayPlanTaskType,
  TodayLearningHubTaskType,
} from './services/learning-plan.service';

@Injectable()
export class EducationService {
  private readonly courseCatalogService: CourseCatalogService;
  private readonly streakService: StreakService;
  private readonly userCourseService: UserCourseService;
  private readonly lessonContentService: LessonContentService;
  private readonly vocabularyService: VocabularyService;
  private readonly learningPlanService: LearningPlanService;

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
    private readonly aiService: AiService,
  ) {
    // The use-case services are instantiated manually here (rather than via
    // Nest DI constructor injection) because education.service.spec.ts
    // constructs `new EducationService(repo1..repo12)` many times and must
    // remain unchanged. Construct leaf services first, then the services that
    // depend on them. Once that spec constraint is relaxed, these can be
    // switched to DI-injected providers in education.module.ts.
    this.courseCatalogService = new CourseCatalogService(
      this.languageRepository,
      this.courseRepository,
    );
    this.streakService = new StreakService(this.userStreakRepository);
    this.userCourseService = new UserCourseService(
      this.userCourseRepository,
      this.userLessonRepository,
      this.userVocabularyRepository,
      this.courseCatalogService,
      this.streakService,
    );
    this.lessonContentService = new LessonContentService(
      this.lessonRepository,
      this.courseRepository,
      this.exerciseRepository,
      this.userLessonRepository,
      this.userCourseRepository,
      this.courseCatalogService,
      this.streakService,
    );
    this.vocabularyService = new VocabularyService(
      this.vocabularyRepository,
      this.userVocabularyRepository,
      this.lessonContentService,
    );
    this.learningPlanService = new LearningPlanService(
      this.userCourseRepository,
      this.lessonRepository,
      this.userLessonRepository,
      this.userVocabularyRepository,
      this.userStreakRepository,
      this.quizSessionRepository,
      this.dailyLearningTaskRepository,
      this.aiService,
      this.userCourseService,
      this.streakService,
    );
  }

  // ==================== LANGUAGES ====================
  async getLanguages(): Promise<Language[]> {
    return this.courseCatalogService.getLanguages();
  }

  async getLanguageById(id: string): Promise<Language> {
    return this.courseCatalogService.getLanguageById(id);
  }

  async resolveLanguageId(languageCode?: string): Promise<string> {
    return this.courseCatalogService.resolveLanguageId(languageCode);
  }

  // ==================== COURSES ====================
  async getCourses(dto: GetCoursesDto): Promise<{
    courses: Course[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.courseCatalogService.getCourses(dto);
  }

  async getCourseById(id: string): Promise<Course> {
    return this.courseCatalogService.getCourseById(id);
  }

  async createCourse(dto: CreateCourseDto): Promise<Course> {
    return this.courseCatalogService.createCourse(dto);
  }

  async updateCourse(id: string, dto: UpdateCourseDto): Promise<Course> {
    return this.courseCatalogService.updateCourse(id, dto);
  }

  // ==================== ENROLLMENT ====================
  async enrollCourse(userId: string, courseId: string): Promise<UserCourse> {
    return this.userCourseService.enrollCourse(userId, courseId);
  }

  async getUserCourses(userId: string): Promise<UserCourse[]> {
    return this.userCourseService.getUserCourses(userId);
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
    return this.lessonContentService.getLessonsByCourse(courseId, page, limit);
  }

  async getLessonById(id: string): Promise<Lesson> {
    return this.lessonContentService.getLessonById(id);
  }

  async createLesson(dto: CreateLessonDto): Promise<Lesson> {
    return this.lessonContentService.createLesson(dto);
  }

  async completeLesson(
    userId: string,
    lessonId: string,
    dto: CompleteLessonDto,
  ): Promise<UserLesson> {
    return this.lessonContentService.completeLesson(userId, lessonId, dto);
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
    return this.vocabularyService.getVocabularyByLesson(lessonId, page, limit);
  }

  async createVocabulary(dto: CreateVocabularyDto): Promise<Vocabulary> {
    return this.vocabularyService.createVocabulary(dto);
  }

  async getVocabularyToReview(
    userId: string,
    limit = 20,
  ): Promise<Vocabulary[]> {
    return this.vocabularyService.getVocabularyToReview(userId, limit);
  }

  async reviewVocabulary(
    userId: string,
    vocabularyId: string,
    dto: ReviewVocabularyDto,
  ): Promise<UserVocabulary> {
    return this.vocabularyService.reviewVocabulary(userId, vocabularyId, dto);
  }

  // ==================== EXERCISES ====================
  async getExercisesByLesson(lessonId: string): Promise<Exercise[]> {
    return this.lessonContentService.getExercisesByLesson(lessonId);
  }

  async createExercise(dto: CreateExerciseDto): Promise<Exercise> {
    return this.lessonContentService.createExercise(dto);
  }

  async submitExercises(
    userId: string,
    lessonId: string,
    dto: SubmitExercisesDto,
  ): Promise<SubmitExercisesResultDto> {
    return this.lessonContentService.submitExercises(userId, lessonId, dto);
  }

  // ==================== STREAK & PROGRESS ====================
  async getUserStreak(userId: string): Promise<UserStreak> {
    return this.streakService.getUserStreak(userId);
  }

  async getUserProgress(userId: string): Promise<{
    streak: UserStreak;
    enrolledCourses: number;
    completedCourses: number;
    completedLessons: number;
    learnedVocabularies: number;
    masteredVocabularies: number;
  }> {
    return this.userCourseService.getUserProgress(userId);
  }

  // ==================== LEARNING PLAN ====================
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
    return this.learningPlanService.getLearningPlan(userId);
  }

  async getLearningCoachSummary(userId: string) {
    return this.learningPlanService.getLearningCoachSummary(userId);
  }

  async getTodayPlan(userId: string): Promise<TodayPlan> {
    return this.learningPlanService.getTodayPlan(userId);
  }

  async getTodayLearningHub(userId: string): Promise<TodayLearningHub> {
    return this.learningPlanService.getTodayLearningHub(userId);
  }

  async getTodayRecommendations(userId: string) {
    return this.learningPlanService.getTodayRecommendations(userId);
  }

  async markTodayPlanTaskComplete(userId: string, taskId: string) {
    return this.learningPlanService.markTodayPlanTaskComplete(userId, taskId);
  }

  async markTodayPlanTasksCompleteByTarget(userId: string, targetUrl: string) {
    return this.learningPlanService.markTodayPlanTasksCompleteByTarget(
      userId,
      targetUrl,
    );
  }

  async markTodayPlanTasksCompleteByType(
    userId: string,
    taskTypes: Array<TodayPlanTaskType | TodayLearningHubTaskType>,
  ) {
    return this.learningPlanService.markTodayPlanTasksCompleteByType(
      userId,
      taskTypes,
    );
  }
}

export type {
  TodayPlan,
  TodayLearningHub,
  TodayPlanTask,
  TodayLearningHubTask,
  TodayLearningHubTaskType,
  TodayPlanTaskType,
} from './services/learning-plan.service';
export { getTodayDateKey } from './services/learning-plan.service';
