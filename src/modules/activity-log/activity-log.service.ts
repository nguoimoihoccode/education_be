import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EducationActivityLog,
  EducationActivityType,
} from './entities/activity-log.entity';
import { QuizSession } from '../education/entities/quiz-session.entity';
import { ReviewSession } from '../education/entities/review-session.entity';
import { UserLesson } from '../education/entities/user-lesson.entity';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';

export type RecordActivityInput = {
  userId: number;
  type: EducationActivityType;
  action: string;
  detail: string;
  xp?: number;
  metadata?: Record<string, unknown>;
};

export type ActivityLogResponse = {
  id: string;
  createdAt: string;
  type: EducationActivityType;
  action: string;
  detail: string;
  xp: number;
};

type ActivityLogRow = ActivityLogResponse & {
  timestamp: number;
  sourceKey?: string;
  sequence: number;
};

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(EducationActivityLog)
    private readonly activityRepository: Repository<EducationActivityLog>,
    @InjectRepository(UserLesson)
    private readonly userLessonRepository: Repository<UserLesson>,
    @InjectRepository(QuizSession)
    private readonly quizSessionRepository: Repository<QuizSession>,
    @InjectRepository(ReviewSession)
    private readonly reviewSessionRepository: Repository<ReviewSession>,
  ) {}

  async record(input: RecordActivityInput): Promise<void> {
    const activity = this.activityRepository.create({
      ...input,
      xp: input.xp ?? 0,
    });

    await this.activityRepository.save(activity);
  }

  async recordBestEffort(input: RecordActivityInput): Promise<void> {
    try {
      await this.record(input);
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to record activity action=${input.action} userId=${input.userId}`,
        stack,
      );
    }
  }

  async list(
    userId: number,
    query: ActivityLogQueryDto,
  ): Promise<{
    data: ActivityLogResponse[];
    meta: { total: number; page: number; totalPages: number };
  }> {
    const [persisted, userLessons, quizSessions, reviewSessions] =
      await Promise.all([
        this.activityRepository.find({
          where: { userId },
          order: { createdAt: 'DESC' },
        }),
        this.userLessonRepository.find({
          where: { userId: String(userId), completed: true },
          relations: ['lesson'],
        }),
        this.quizSessionRepository.find({
          where: { userId, completed: true },
          relations: ['quiz'],
        }),
        this.reviewSessionRepository.find({
          where: { userId, completed: true },
          relations: ['deck'],
        }),
      ]);

    let sequence = 0;
    const persistedRows = persisted.map<ActivityLogRow>((activity) => ({
      id: activity.id,
      createdAt: activity.createdAt.toISOString(),
      type: activity.type,
      action: activity.action,
      detail: activity.detail,
      xp: activity.xp,
      timestamp: activity.createdAt.getTime(),
      sourceKey: this.getSourceKey(activity.metadata),
      sequence: sequence++,
    }));
    const persistedSourceKeys = new Set(
      persistedRows
        .map(({ sourceKey }) => sourceKey)
        .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
    );

    const projectedRows = [
      ...userLessons.flatMap<ActivityLogRow>((userLesson) => {
        if (!userLesson.completedAt) {
          return [];
        }

        const sourceKey = `lesson:${userLesson.id}`;
        return [
          this.createProjectedRow({
            id: sourceKey,
            createdAt: userLesson.completedAt,
            type: EducationActivityType.LEARNING,
            action: 'lesson_completed',
            detail: this.buildDetail(
              'Completed lesson',
              userLesson.lesson?.title,
            ),
            xp: 0,
            sourceKey,
            sequence: sequence++,
          }),
        ];
      }),
      ...quizSessions.flatMap<ActivityLogRow>((quizSession) => {
        if (!quizSession.completedAt) {
          return [];
        }

        const quiz = quizSession.quiz as
          | { name?: string; title?: string }
          | undefined;
        const sourceKey = `quiz:${quizSession.id}`;
        return [
          this.createProjectedRow({
            id: sourceKey,
            createdAt: quizSession.completedAt,
            type: EducationActivityType.LEARNING,
            action: 'quiz_completed',
            detail: this.buildDetail(
              'Completed quiz',
              quiz?.name ?? quiz?.title,
            ),
            xp: 0,
            sourceKey,
            sequence: sequence++,
          }),
        ];
      }),
      ...reviewSessions.flatMap<ActivityLogRow>((reviewSession) => {
        if (!reviewSession.completedAt) {
          return [];
        }

        const sourceKey = `flashcard:${reviewSession.id}`;
        return [
          this.createProjectedRow({
            id: sourceKey,
            createdAt: reviewSession.completedAt,
            type: EducationActivityType.PRACTICE,
            action: 'flashcard_review_completed',
            detail: this.buildDetail(
              'Completed flashcard review',
              reviewSession.deck?.name,
            ),
            xp: reviewSession.xpEarned,
            sourceKey,
            sequence: sequence++,
          }),
        ];
      }),
    ].filter(
      ({ sourceKey }) => !sourceKey || !persistedSourceKeys.has(sourceKey),
    );

    const search = query.search?.trim().toLocaleLowerCase();
    const filteredRows = [...persistedRows, ...projectedRows]
      .filter((row) => !query.type || row.type === query.type)
      .filter(
        (row) =>
          !search ||
          row.action.toLocaleLowerCase().includes(search) ||
          row.detail.toLocaleLowerCase().includes(search),
      )
      .sort(
        (left, right) =>
          right.timestamp - left.timestamp || left.sequence - right.sequence,
      );

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const total = filteredRows.length;
    const start = (page - 1) * limit;
    const data = filteredRows
      .slice(start, start + limit)
      .map<ActivityLogResponse>(
        ({ id, createdAt, type, action, detail, xp }) => ({
          id,
          createdAt,
          type,
          action,
          detail,
          xp,
        }),
      );

    return {
      data,
      meta: {
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private getSourceKey(
    metadata?: Record<string, unknown> | null,
  ): string | undefined {
    return typeof metadata?.sourceKey === 'string'
      ? metadata.sourceKey
      : undefined;
  }

  private createProjectedRow(input: {
    id: string;
    createdAt: Date;
    type: EducationActivityType;
    action: string;
    detail: string;
    xp: number;
    sourceKey: string;
    sequence: number;
  }): ActivityLogRow {
    return {
      ...input,
      createdAt: input.createdAt.toISOString(),
      timestamp: input.createdAt.getTime(),
    };
  }

  private buildDetail(action: string, subject?: string): string {
    return subject ? `${action}: ${subject}` : action;
  }
}
