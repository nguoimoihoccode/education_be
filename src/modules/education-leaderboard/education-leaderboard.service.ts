import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  LeaderboardCategory,
  LeaderboardPeriod,
  LeaderboardQueryDto,
} from './dto/leaderboard-query.dto';

export const EDUCATION_LEADERBOARD_CLOCK = Symbol(
  'EDUCATION_LEADERBOARD_CLOCK',
);

export type EducationLeaderboardClock = () => Date;

export interface EducationLeaderboardRow {
  id: string;
  rank: number;
  displayName: string;
  avatar?: string;
  xp: number;
  streak: number;
  lessonsCompleted: number;
  quizScore: number;
  level: number;
  badge: string;
  change: 'same';
  changeAmount: 0;
}

export interface EducationLeaderboardResponse {
  data: EducationLeaderboardRow[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  currentUser?: EducationLeaderboardRow;
}

interface RawLeaderboardResult {
  data?: unknown;
  total?: unknown;
  currentUser?: unknown;
}

interface RawStatsResult {
  totalXp?: unknown;
  totalLessons?: unknown;
  totalQuizzesPassed?: unknown;
  totalHoursStudied?: unknown;
}

const CATEGORY_ORDER_EXPRESSIONS: Record<LeaderboardCategory, string> = {
  [LeaderboardCategory.XP]: 'm.xp',
  [LeaderboardCategory.STREAK]: 'm.streak',
  [LeaderboardCategory.LESSONS]: 'm.lessons_completed',
  [LeaderboardCategory.QUIZ]: 'm.quiz_score',
};

export function getLeaderboardOrderExpression(
  category: LeaderboardCategory,
): string {
  return CATEGORY_ORDER_EXPRESSIONS[category] ?? CATEGORY_ORDER_EXPRESSIONS.xp;
}

export function getPeriodCutoff(
  period: LeaderboardPeriod,
  now: Date,
): Date | null {
  if (period === LeaderboardPeriod.ALL) {
    return null;
  }

  if (period === LeaderboardPeriod.MONTH) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const daysSinceMonday = (cutoff.getUTCDay() + 6) % 7;
  cutoff.setUTCDate(cutoff.getUTCDate() - daysSinceMonday);
  return cutoff;
}

export function getLeaderboardBadge(level: number, streak: number): string {
  if (level >= 20) {
    return 'trophy';
  }
  if (streak >= 7) {
    return 'streak';
  }
  return 'learner';
}

@Injectable()
export class EducationLeaderboardService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(EDUCATION_LEADERBOARD_CLOCK)
    private readonly clock: EducationLeaderboardClock,
  ) {}

  async list(
    currentUserId: number,
    query: LeaderboardQueryDto,
  ): Promise<EducationLeaderboardResponse> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const period = query.period ?? LeaderboardPeriod.WEEK;
    const category = query.category ?? LeaderboardCategory.XP;
    const cutoff = getPeriodCutoff(period, this.clock());
    const search = query.search?.trim() || null;
    const orderExpression = getLeaderboardOrderExpression(category);
    const sql = this.buildListSql(orderExpression);
    const rows = await this.dataSource.query<RawLeaderboardResult[]>(sql, [
      cutoff?.toISOString() ?? null,
      search,
      limit,
      (page - 1) * limit,
      currentUserId,
    ]);
    const raw = rows[0] ?? {};
    const data = this.parseRows(raw.data).map((row) => this.mapRow(row));
    const total = this.toNumber(raw.total);
    const currentUserRaw = this.parseOptionalRow(raw.currentUser);
    const currentUser = currentUserRaw
      ? this.mapRow(currentUserRaw)
      : undefined;

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
      ...(currentUser ? { currentUser } : {}),
    };
  }

  async stats(): Promise<{
    totalXp: number;
    totalLessons: number;
    totalQuizzesPassed: number;
    totalHoursStudied: number;
  }> {
    const rows = await this.dataSource.query<RawStatsResult[]>(`
      SELECT
        COALESCE(
          (SELECT SUM(us.total_xp) FROM edu_user_streaks us),
          0
        ) AS "totalXp",
        COALESCE(
          (
            SELECT COUNT(*)
            FROM edu_user_lessons ul
            WHERE ul.completed = TRUE
          ),
          0
        ) AS "totalLessons",
        COALESCE(
          (
            SELECT COUNT(*)
            FROM edu_quiz_sessions qs
            WHERE qs.completed = TRUE AND qs.passed = TRUE
          ),
          0
        ) AS "totalQuizzesPassed",
        ROUND(
          COALESCE(
            (SELECT SUM(uc.total_time_spent) FROM edu_user_courses uc),
            0
          )::numeric / 3600.0,
          1
        ) AS "totalHoursStudied"
    `);
    const raw = rows[0] ?? {};

    return {
      totalXp: this.toNumber(raw.totalXp),
      totalLessons: this.toNumber(raw.totalLessons),
      totalQuizzesPassed: this.toNumber(raw.totalQuizzesPassed),
      totalHoursStudied: this.toNumber(raw.totalHoursStudied),
    };
  }

  async me(userId: number): Promise<EducationLeaderboardRow> {
    const orderExpression = getLeaderboardOrderExpression(
      LeaderboardCategory.XP,
    );
    const sql = `
      WITH
      ${this.buildMetricsCtes()},
      ${this.buildRankedCte(orderExpression)}
      SELECT (
        SELECT ${this.buildJsonRow('m', 'COALESCE(r.rank, 0)')}
        FROM metrics m
        LEFT JOIN ranked r ON r.user_id = m.user_id
        WHERE m.user_id = $2
      ) AS row
    `;
    const rows = await this.dataSource.query<Array<{ row?: unknown }>>(sql, [
      null,
      userId,
    ]);
    const row = this.parseOptionalRow(rows[0]?.row);

    if (!row) {
      throw new NotFoundException('User not found');
    }

    return this.mapRow(row);
  }

  private buildListSql(orderExpression: string): string {
    return `
      WITH
      ${this.buildMetricsCtes()},
      ${this.buildRankedCte(orderExpression)},
      searched AS (
        SELECT r.*
        FROM ranked r
        WHERE (
          $2::text IS NULL
          OR r.display_name ILIKE '%' || $2 || '%'
        )
      ),
      page_rows AS (
        SELECT s.*
        FROM searched s
        ORDER BY s.rank
        LIMIT $3 OFFSET $4
      )
      SELECT
        COALESCE(
          (
            SELECT jsonb_agg(
              ${this.buildJsonRow('p', 'p.rank')}
              ORDER BY p.rank
            )
            FROM page_rows p
          ),
          '[]'::jsonb
        ) AS data,
        (SELECT COUNT(*)::int FROM searched) AS total,
        (
          SELECT ${this.buildJsonRow('current_match', 'current_match.rank')}
          FROM searched current_match
          WHERE current_match.user_id = $5
        ) AS "currentUser"
    `;
  }

  private buildMetricsCtes(): string {
    return `
      streak_metrics AS (
        SELECT
          us.user_id,
          COALESCE(us.total_xp, 0)::int AS total_xp,
          COALESCE(us.current_streak, 0)::int AS current_streak,
          COALESCE(us.level, 1)::int AS level
        FROM edu_user_streaks us
      ),
      lesson_metrics AS (
        SELECT
          ul.user_id,
          COUNT(*)::int AS lessons_completed
        FROM edu_user_lessons ul
        WHERE ul.completed = TRUE
          AND (
            $1::timestamptz IS NULL
            OR ul.completed_at >= ($1::timestamptz AT TIME ZONE 'UTC')
          )
        GROUP BY ul.user_id
      ),
      quiz_metrics AS (
        SELECT
          qs."userId" AS user_id,
          COALESCE(SUM(qs."earnedPoints"), 0)::numeric AS quiz_earned,
          COALESCE(SUM(qs."totalPoints"), 0)::numeric AS quiz_total
        FROM edu_quiz_sessions qs
        WHERE qs.completed = TRUE
          AND (
            $1::timestamptz IS NULL
            OR qs."completedAt" >= ($1::timestamptz AT TIME ZONE 'UTC')
          )
        GROUP BY qs."userId"
      ),
      metrics AS (
        SELECT
          u.id AS user_id,
          u.id::text AS id,
          COALESCE(
            NULLIF(BTRIM(u.name), ''),
            SPLIT_PART(u.email, '@', 1)
          ) AS display_name,
          u.avatar,
          COALESCE(s.total_xp, 0)::int AS xp,
          COALESCE(s.current_streak, 0)::int AS streak,
          COALESCE(l.lessons_completed, 0)::int AS lessons_completed,
          CASE
            WHEN COALESCE(q.quiz_total, 0) > 0
              THEN ROUND(
                100.0 * q.quiz_earned / NULLIF(q.quiz_total, 0)
              )::int
            ELSE 0
          END AS quiz_score,
          COALESCE(q.quiz_earned, 0) AS quiz_earned,
          COALESCE(q.quiz_total, 0) AS quiz_total,
          COALESCE(s.level, 1)::int AS level
        FROM users u
        LEFT JOIN streak_metrics s ON s.user_id = u.id::text
        LEFT JOIN lesson_metrics l ON l.user_id = u.id::text
        LEFT JOIN quiz_metrics q ON q.user_id = u.id
      )
    `;
  }

  private buildRankedCte(orderExpression: string): string {
    // XP and streak are current snapshots for every period; only lesson and
    // quiz subqueries receive the UTC cutoff.
    return `
      ranked AS (
        SELECT
          m.*,
          ROW_NUMBER() OVER (
            ORDER BY ${orderExpression} DESC, m.xp DESC, m.user_id ASC
          ) AS rank
        FROM metrics m
        WHERE (
          m.xp <> 0 OR m.streak <> 0 OR m.lessons_completed <> 0
          OR m.quiz_score <> 0
        )
      )
    `;
  }

  private buildJsonRow(alias: string, rankExpression: string): string {
    return `
      jsonb_build_object(
        'id', ${alias}.id,
        'rank', ${rankExpression},
        'displayName', ${alias}.display_name,
        'avatar', ${alias}.avatar,
        'xp', ${alias}.xp,
        'streak', ${alias}.streak,
        'lessonsCompleted', ${alias}.lessons_completed,
        'quizScore', ${alias}.quiz_score,
        'level', ${alias}.level
      )
    `;
  }

  private parseRows(value: unknown): Array<Record<string, unknown>> {
    const parsed = this.parseJson(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (row): row is Record<string, unknown> =>
            typeof row === 'object' && row !== null,
        )
      : [];
  }

  private parseOptionalRow(
    value: unknown,
  ): Record<string, unknown> | undefined {
    const parsed = this.parseJson(value);
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  }

  private parseJson(value: unknown): unknown {
    if (typeof value !== 'string') {
      return value;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }

  private mapRow(raw: Record<string, unknown>): EducationLeaderboardRow {
    const level = this.toNumber(raw.level, 1);
    const streak = this.toNumber(raw.streak);
    const avatar =
      typeof raw.avatar === 'string' && raw.avatar.length > 0
        ? raw.avatar
        : undefined;

    return {
      id: String(raw.id),
      rank: this.toNumber(raw.rank),
      displayName: typeof raw.displayName === 'string' ? raw.displayName : '',
      ...(avatar ? { avatar } : {}),
      xp: this.toNumber(raw.xp),
      streak,
      lessonsCompleted: this.toNumber(raw.lessonsCompleted),
      quizScore: this.toNumber(raw.quizScore),
      level,
      badge: getLeaderboardBadge(level, streak),
      change: 'same',
      changeAmount: 0,
    };
  }

  private toNumber(value: unknown, fallback = 0): number {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : fallback;
  }
}
