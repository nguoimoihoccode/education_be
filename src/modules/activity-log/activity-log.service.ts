import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  EducationActivityLog,
  EducationActivityType,
} from './entities/activity-log.entity';
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

type ActivityLogQueryRow = {
  id: string;
  sourceKey: string;
  createdAt: Date | string;
  type: EducationActivityType;
  action: string;
  detail: string;
  xp: number;
};

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(EducationActivityLog)
    private readonly activityRepository: Repository<EducationActivityLog>,
    private readonly dataSource: DataSource,
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
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const offset = (page - 1) * limit;
    const search = query.search?.trim().toLocaleLowerCase();
    const filterParams = [
      userId,
      query.type ?? null,
      search ? `%${search}%` : null,
    ];
    const commonTableExpression = this.buildActivityRowsCte();
    const countRows = await this.dataSource.query(
      `${commonTableExpression}
      SELECT COUNT(*)::int AS total
      FROM filtered_rows`,
      filterParams,
    );
    const rows = await this.dataSource.query(
      `${commonTableExpression}
      SELECT
        id,
        source_key AS "sourceKey",
        created_at AS "createdAt",
        type,
        action,
        detail,
        xp
      FROM filtered_rows
      ORDER BY created_at DESC, source_priority ASC, id ASC
      LIMIT $4 OFFSET $5`,
      [...filterParams, limit, offset],
    );
    const total = Number(
      (countRows as Array<{ total: number | string }>)[0]?.total ?? 0,
    );
    const data = (rows as ActivityLogQueryRow[]).map<ActivityLogResponse>(
      ({ id, createdAt, type, action, detail, xp }) => ({
        id,
        createdAt: new Date(createdAt).toISOString(),
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

  private buildActivityRowsCte(): string {
    return `
      WITH activity_rows AS (
        SELECT
          activity.id::text AS id,
          COALESCE(activity.metadata->>'sourceKey', 'persisted:' || activity.id::text) AS source_key,
          activity.created_at AS created_at,
          activity.type::text AS type,
          activity.action,
          activity.detail,
          activity.xp,
          0 AS source_priority
        FROM edu_activity_logs activity
        WHERE activity.user_id = $1

        UNION ALL

        SELECT
          'lesson:' || user_lesson.id::text AS id,
          'lesson:' || user_lesson.lesson_id::text || ':user:' || $1::text AS source_key,
          user_lesson.completed_at AS created_at,
          'learning'::text AS type,
          'lesson_completed'::text AS action,
          CONCAT(
            'Completed lesson',
            CASE
              WHEN lesson.title IS NULL OR lesson.title = '' THEN ''
              ELSE ': ' || lesson.title
            END
          ) AS detail,
          0 AS xp,
          1 AS source_priority
        FROM edu_user_lessons user_lesson
        LEFT JOIN edu_lessons lesson ON lesson.id = user_lesson.lesson_id
        WHERE user_lesson.user_id = $1::text
          AND user_lesson.completed = true
          AND user_lesson.completed_at IS NOT NULL

        UNION ALL

        SELECT
          'quiz:' || quiz_session.id::text AS id,
          'quiz:' || quiz_session.id::text AS source_key,
          quiz_session."completedAt" AS created_at,
          'learning'::text AS type,
          'quiz_completed'::text AS action,
          CONCAT(
            'Completed quiz',
            CASE
              WHEN quiz.name IS NULL OR quiz.name = '' THEN ''
              ELSE ': ' || quiz.name
            END
          ) AS detail,
          0 AS xp,
          1 AS source_priority
        FROM edu_quiz_sessions quiz_session
        LEFT JOIN edu_quizzes quiz ON quiz.id = quiz_session."quizId"
        WHERE quiz_session."userId" = $1
          AND quiz_session.completed = true
          AND quiz_session."completedAt" IS NOT NULL

        UNION ALL

        SELECT
          'flashcard:' || review_session.id::text AS id,
          'flashcard:' || review_session.id::text AS source_key,
          review_session."completedAt" AS created_at,
          'practice'::text AS type,
          'flashcard_review_completed'::text AS action,
          CONCAT(
            'Completed flashcard review',
            CASE
              WHEN deck.name IS NULL OR deck.name = '' THEN ''
              ELSE ': ' || deck.name
            END
          ) AS detail,
          review_session."xpEarned" AS xp,
          1 AS source_priority
        FROM edu_flashcard_review_sessions review_session
        LEFT JOIN edu_flashcard_decks deck ON deck.id = review_session."deckId"
        WHERE review_session."userId" = $1
          AND review_session.completed = true
          AND review_session."completedAt" IS NOT NULL
      ),
      ranked_rows AS (
        SELECT
          id,
          source_key,
          created_at,
          type,
          action,
          detail,
          xp,
          source_priority,
          ROW_NUMBER() OVER (
            PARTITION BY source_key
            ORDER BY source_priority ASC, created_at DESC, id ASC
          ) AS source_rank
        FROM activity_rows
      ),
      filtered_rows AS (
        SELECT
          id,
          source_key,
          created_at,
          type,
          action,
          detail,
          xp,
          source_priority
        FROM ranked_rows
        WHERE source_rank = 1
          AND ($2::text IS NULL OR type = $2::text)
          AND (
            $3::text IS NULL
            OR LOWER(action || ' ' || detail) LIKE $3::text
          )
      )`;
  }
}
