import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
  UserCourse,
  Lesson,
  UserLesson,
  UserVocabulary,
  UserStreak,
  QuizSession,
  DailyLearningTask,
  EnrollmentStatus,
} from '../entities';
import { AiService } from '../../ai/ai.service';
import { UserCourseService } from './user-course.service';

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

export const getTodayDateKey = (): string => {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
};

@Injectable()
export class LearningPlanService {
  constructor(
    @InjectRepository(UserCourse)
    private readonly userCourseRepository: Repository<UserCourse>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(UserLesson)
    private readonly userLessonRepository: Repository<UserLesson>,
    @InjectRepository(UserVocabulary)
    private readonly userVocabularyRepository: Repository<UserVocabulary>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
    @InjectRepository(QuizSession)
    private readonly quizSessionRepository: Repository<QuizSession>,
    @InjectRepository(DailyLearningTask)
    private readonly dailyLearningTaskRepository: Repository<DailyLearningTask>,
    private readonly aiService: AiService,
    private readonly userCourseService: UserCourseService,
  ) {}

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

  async getLearningCoachSummary(userId: string) {
    const [learningPlan, todayPlan, progress] = await Promise.all([
      this.getLearningPlan(userId),
      this.getTodayPlan(userId),
      this.userCourseService.getUserProgress(userId),
    ]);
    const goalMinutes = learningPlan.dailyGoal.targetMinutes || 1;
    const planCompletion = todayPlan.totalTasks
      ? Math.round((todayPlan.completedTasks / todayPlan.totalTasks) * 100)
      : 0;
    const minuteCompletion = Math.round(
      (learningPlan.dailyGoal.completedMinutes / goalMinutes) * 100,
    );
    let headline =
      todayPlan.completedTasks > 0
        ? 'Bạn đang giữ nhịp học tốt hôm nay'
        : 'Coach đã xếp lộ trình học hôm nay';
    let focusArea = learningPlan.weakQuizzes[0]?.topic || 'Duy trì nhịp học';

    try {
      const narrative = await this.aiService.completeJson<{
        headline?: string;
        focusArea?: string;
      }>({
        system:
          'You are a concise learning coach. Return JSON {"headline","focusArea"} in Vietnamese. Max 120 chars each. No markdown. Be encouraging and specific.',
        user: JSON.stringify({
          completedTasks: todayPlan.completedTasks,
          totalTasks: todayPlan.totalTasks,
          planCompletion,
          minuteCompletion,
          streak: learningPlan.streak,
          weakQuizzes: learningPlan.weakQuizzes.slice(0, 3),
          dueReviews: learningPlan.dueReviews.count,
          nextLesson: learningPlan.nextLesson?.title,
        }),
      });

      if (
        typeof narrative?.headline === 'string' &&
        narrative.headline.trim()
      ) {
        headline = narrative.headline.trim().slice(0, 160);
      }
      if (
        typeof narrative?.focusArea === 'string' &&
        narrative.focusArea.trim()
      ) {
        focusArea = narrative.focusArea.trim().slice(0, 120);
      }
    } catch {
      // Keep rule-based defaults when AI is unavailable
    }

    return {
      headline,
      focusArea,
      dailyGoal: learningPlan.dailyGoal,
      progress: {
        planCompletion,
        minuteCompletion: Math.min(100, minuteCompletion),
        completedLessons: progress.completedLessons,
        masteredVocabularies: progress.masteredVocabularies,
      },
      streak: learningPlan.streak,
      nextBestAction: learningPlan.recommendedActions[0],
      risks: learningPlan.weakQuizzes.map((quiz) => ({
        title: quiz.title,
        topic: quiz.topic,
        score: quiz.score,
        route: quiz.route,
      })),
      tasks: todayPlan.tasks,
      recommendations: learningPlan.recommendedActions,
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
    const sortedTasks = tasks
      .sort((a, b) => a.priority - b.priority)
      .slice(0, 4);
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
    const completedTasks = tasksWithCompletion.filter(
      (task) => task.completed,
    ).length;
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
