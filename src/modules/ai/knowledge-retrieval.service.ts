import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { CacheService } from '../../common/cache/cache.service';
import { EmbeddingConfig, EmbeddingService } from './embedding.service';
import {
  AiKnowledgeChunk,
  AiKnowledgeSourceType,
} from './entities/ai-knowledge-chunk.entity';
import { AiRetrievalLog } from './entities/ai-retrieval-log.entity';
import { UUID_PATTERN, formatVector } from './knowledge.util';

/**
 * The semantic tier: finds corpus chunks near an arbitrary question, for
 * questions that are not tied to the lesson being studied.
 */

/**
 * Chunks per search. Six is the plan's ceiling: past that the prompt stops being
 * a source and starts being a haystack, and the question loses salience among it.
 */
export const DEFAULT_RETRIEVAL_LIMIT = 6;
export const MAX_RETRIEVAL_LIMIT = 12;

/**
 * Largest cosine distance still considered a match. Cosine distance is
 * `1 - similarity`, so this is a similarity floor of 0.25.
 *
 * Deliberately loose, and chosen without real traffic to measure against — the
 * plan calls for tuning it once there is data. Loose is the safer error: a
 * marginal chunk that does get included is mild noise the model can ignore,
 * while one wrongly excluded turns a grounded answer into "tài liệu không đề
 * cập", which reads to the learner as the tutor not knowing its own material.
 *
 * That data now exists: every search writes its candidate distances to
 * `ai_retrieval_logs`, and `GET /ai/knowledge/retrieval-stats` aggregates them.
 * Move this number only when that distribution says so — mass sitting just
 * above it with a high zero-hit rate means too tight, mass far below it means
 * it could be tightened without losing ground.
 */
export const MAX_COSINE_DISTANCE = 0.75;

/**
 * Query embeddings are cached because the same handful of questions gets asked
 * over and over across a class, and the vector depends only on the text and the
 * model — never on who is asking.
 */
export const QUERY_EMBEDDING_CACHE_TTL_SECONDS = 3600;
const QUERY_EMBEDDING_CACHE_PREFIX = 'ai:rag:q:';

/** Longest prefix of the learner's question kept in `ai_retrieval_logs`. */
export const QUERY_PREVIEW_LENGTH = 300;

/**
 * The stats endpoint's default and widest look-back. Tuning needs a long
 * window; the endpoint is not a dashboard, so there is no reason to make it
 * wider than a season of traffic.
 */
export const RETRIEVAL_STATS_DEFAULT_DAYS = 30;
export const RETRIEVAL_STATS_MAX_WINDOW_DAYS = 90;

/**
 * How long a retrieval log row earns its keep. The nightly reindex task prunes
 * past this, so the table grows with traffic but never without bound.
 */
export const RETRIEVAL_LOG_RETENTION_DAYS = 90;

export interface KnowledgeSearchOptions {
  limit?: number;
  /** Restrict to one lesson. */
  lessonId?: string | null;
  /** Restrict to one course. */
  courseId?: string | null;
  /**
   * Skip a lesson's chunks. Used when the caller already has that lesson's full
   * text in the prompt, where retrieving pieces of it again would spend budget
   * to say nothing new.
   */
  excludeLessonId?: string | null;
  /**
   * Observability only: copied into `ai_retrieval_logs` so the stats endpoint
   * can group searches by context. Nothing here filters the search.
   */
  logContext?: {
    conversationId?: string | null;
    lessonId?: string | null;
  };
}

export interface KnowledgeHit {
  id: string;
  sourceType: AiKnowledgeSourceType;
  lessonId: string;
  courseId: string | null;
  title: string;
  content: string;
  distance: number;
}

interface ChunkRow {
  id: string;
  source_type: AiKnowledgeSourceType;
  lesson_id: string;
  course_id: string | null;
  title: string;
  content: string;
  distance: number | string;
}

/**
 * Distance bands for the stats endpoint, half-open `[from, to)` — `to` is
 * exclusive, null is unbounded. The `edge`/`beyond` seam is the threshold
 * itself, so the bands keep meaning when `MAX_COSINE_DISTANCE` moves; 0.9 is
 * simply "past the threshold by a wide margin", not a tuned number.
 */
export interface RetrievalDistanceBucket {
  key: 'very-close' | 'close' | 'edge' | 'beyond' | 'far' | 'none';
  from: number | null;
  to: number | null;
  count: number;
}

const DISTANCE_BANDS: ReadonlyArray<{
  key: RetrievalDistanceBucket['key'];
  from: number | null;
  to: number | null;
}> = [
  { key: 'very-close', from: 0, to: 0.3 },
  { key: 'close', from: 0.3, to: 0.5 },
  { key: 'edge', from: 0.5, to: MAX_COSINE_DISTANCE },
  { key: 'beyond', from: MAX_COSINE_DISTANCE, to: 0.9 },
  { key: 'far', from: 0.9, to: null },
];

export interface KnowledgeRetrievalStats {
  windowDays: number;
  currentThreshold: number;
  totalQueries: number;
  queriesWithHits: number;
  zeroHitQueries: number;
  zeroHitRate: number;
  avgHitCount: number | null;
  bestDistance: {
    avg: number | null;
    min: number | null;
    max: number | null;
    p50: number | null;
    p90: number | null;
  };
  buckets: RetrievalDistanceBucket[];
  recentZeroHitQueries: {
    queryPreview: string;
    bestDistance: number | null;
    createdAt: string;
  }[];
}

/**
 * Nearest-rank percentile over an ascending copy of `values`. Precision is not
 * the point here — the shape of the distribution is.
 */
export function percentile(values: number[], q: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(q * (sorted.length - 1))),
  );
  return sorted[index];
}

const clampStatsDays = (days: number | undefined): number => {
  if (days === undefined || !Number.isFinite(days)) {
    return RETRIEVAL_STATS_DEFAULT_DAYS;
  }
  return Math.min(
    Math.max(Math.floor(days), 1),
    RETRIEVAL_STATS_MAX_WINDOW_DAYS,
  );
};

@Injectable()
export class KnowledgeRetrievalService {
  private readonly logger = new Logger(KnowledgeRetrievalService.name);

  constructor(
    @InjectRepository(AiKnowledgeChunk)
    private readonly chunksRepo: Repository<AiKnowledgeChunk>,
    @InjectRepository(AiRetrievalLog)
    private readonly logsRepo: Repository<AiRetrievalLog>,
    private readonly embedding: EmbeddingService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Nearest chunks to `query`, closest first, or an empty list.
   *
   * Never throws. Retrieval is an enhancement to the answer, not the path to it:
   * with no embedding provider configured, or one briefly down, the tutor still
   * answers from the lesson-scoped tier. Failing the learner's message here would
   * trade a slightly worse answer for no answer at all.
   *
   * Every search that actually reaches the vector index also writes one row to
   * `ai_retrieval_logs` (best-effort), which is what makes the threshold
   * tunable later.
   */
  async search(
    query: string,
    options: KnowledgeSearchOptions = {},
  ): Promise<KnowledgeHit[]> {
    const text = query.trim().replace(/\s+/g, ' ');
    if (!text) {
      return [];
    }

    // Read before the guard below so an unconfigured provider is silent rather
    // than logged: it is a state an admin has not set up yet, not a failure.
    const config = await this.embedding.resolveConfig();
    if (!config.apiKey) {
      return [];
    }

    let vector: number[];
    try {
      vector = await this.embedQuery(text, config);
    } catch (err) {
      this.logger.warn(
        `Knowledge retrieval skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }

    const candidates = await this.nearest(vector, options);
    const hits = candidates
      .filter((candidate) => candidate.distance <= MAX_COSINE_DISTANCE)
      .slice(0, this.clampLimit(options.limit));

    await this.logSearch(text, options, candidates, hits);
    return hits;
  }

  /**
   * Aggregated retrieval distances over the last `days` — the evidence base for
   * tuning `MAX_COSINE_DISTANCE` (RAG plan gap #7). The per-query
   * `best_distance` is the number to read: its distribution, together with the
   * zero-hit rate, says whether the threshold cuts the corpus where the
   * questions actually are.
   */
  async stats(days?: number): Promise<KnowledgeRetrievalStats> {
    const windowDays = clampStatsDays(days);
    const since = `now() - make_interval(days => ${windowDays}::int)`;

    // The window is a season of one-row-per-message traffic, so the aggregate
    // is computed here rather than in SQL — testable, and the query stays
    // trivial. Annotated like `nearest`: `query` is untyped, so the row shape
    // is stated where the Postgres column names appear.
    interface LogRow {
      best_distance: number | string | null;
      hit_count: number | string;
    }
    const rows: LogRow[] = await this.logsRepo.query(
      `SELECT best_distance, hit_count
         FROM ai_retrieval_logs
        WHERE created_at >= ${since}`,
    );

    const best = rows
      .map((row) =>
        row.best_distance === null ? null : Number(row.best_distance),
      )
      .filter((distance): distance is number => distance !== null);
    const hitCounts = rows.map((row) => Number(row.hit_count));
    const totalQueries = rows.length;
    const queriesWithHits = hitCounts.filter((count) => count > 0).length;

    const buckets: RetrievalDistanceBucket[] = [
      ...DISTANCE_BANDS.map((band) => ({
        key: band.key,
        from: band.from,
        to: band.to,
        count: best.filter(
          (distance) =>
            (band.from === null || distance >= band.from) &&
            (band.to === null || distance < band.to),
        ).length,
      })),
      {
        key: 'none',
        from: null,
        to: null,
        count: totalQueries - best.length,
      },
    ];

    const zeroHitRows: {
      query_preview: string;
      best_distance: number | string | null;
      created_at: Date | string;
    }[] = await this.logsRepo.query(
      `SELECT query_preview, best_distance, created_at
         FROM ai_retrieval_logs
        WHERE hit_count = 0 AND created_at >= ${since}
        ORDER BY created_at DESC
        LIMIT 10`,
    );

    return {
      windowDays,
      currentThreshold: MAX_COSINE_DISTANCE,
      totalQueries,
      queriesWithHits,
      zeroHitQueries: totalQueries - queriesWithHits,
      zeroHitRate:
        totalQueries === 0
          ? 0
          : (totalQueries - queriesWithHits) / totalQueries,
      avgHitCount:
        hitCounts.length === 0
          ? null
          : hitCounts.reduce((sum, count) => sum + count, 0) / hitCounts.length,
      bestDistance: {
        avg:
          best.length === 0
            ? null
            : best.reduce((sum, distance) => sum + distance, 0) / best.length,
        min: best.length === 0 ? null : Math.min(...best),
        max: best.length === 0 ? null : Math.max(...best),
        p50: percentile(best, 0.5),
        p90: percentile(best, 0.9),
      },
      buckets,
      recentZeroHitQueries: zeroHitRows.map((row) => ({
        queryPreview: row.query_preview,
        bestDistance:
          row.best_distance === null ? null : Number(row.best_distance),
        createdAt: new Date(row.created_at).toISOString(),
      })),
    };
  }

  /**
   * Drops log rows past `RETRIEVAL_LOG_RETENTION_DAYS`. Called nightly from the
   * reindex task so the table needs no cron of its own; returns the number of
   * rows removed.
   */
  async pruneOldLogs(): Promise<number> {
    const cutoff = new Date(
      Date.now() - RETRIEVAL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await this.logsRepo.delete({ createdAt: LessThan(cutoff) });
    return result.affected ?? 0;
  }

  private async embedQuery(
    text: string,
    config: EmbeddingConfig,
  ): Promise<number[]> {
    // The model and width belong in the key: changing either moves every vector
    // into a different space, and a cached query vector from the old model would
    // not merely be stale — it would be meaningless, and would retrieve by
    // coincidence.
    const digest = createHash('sha256').update(text).digest('hex');
    const key = `${QUERY_EMBEDDING_CACHE_PREFIX}${config.model}:${config.dimensions}:${digest}`;

    const cached = await this.cache.get<number[]>(key);
    if (cached) {
      return cached;
    }

    const [vector] = await this.embedding.embed([text]);
    await this.cache.set(key, vector, QUERY_EMBEDDING_CACHE_TTL_SECONDS);
    return vector;
  }

  /**
   * The nearest candidates regardless of quality, closest first.
   *
   * The threshold is applied by the caller, not here: the whole reason this log
   * exists is to see the near-misses, and a chunk at distance 0.78 is exactly
   * the datapoint that says "0.75 is slightly too tight". The scan still stops
   * at `MAX_RETRIEVAL_LIMIT` rows, so a question buried under a dozen mediocre
   * matches could miss a good one ranked below them — the same approximation an
   * HNSW index makes anyway, and the empty-search failure mode stays "fewer
   * references", not a wrong answer.
   */
  private async nearest(
    vector: number[],
    options: KnowledgeSearchOptions,
  ): Promise<KnowledgeHit[]> {
    const params: unknown[] = [formatVector(vector)];
    const filters: string[] = [];

    // Only well-formed uuids reach the query: these ids are client-supplied, and
    // a malformed one would be an invalid-uuid error rather than an empty result.
    if (options.lessonId && UUID_PATTERN.test(options.lessonId)) {
      params.push(options.lessonId);
      filters.push(`lesson_id = $${params.length}`);
    }
    if (options.courseId && UUID_PATTERN.test(options.courseId)) {
      params.push(options.courseId);
      filters.push(`course_id = $${params.length}`);
    }
    if (options.excludeLessonId && UUID_PATTERN.test(options.excludeLessonId)) {
      params.push(options.excludeLessonId);
      filters.push(`lesson_id <> $${params.length}`);
    }

    params.push(MAX_RETRIEVAL_LIMIT);
    const where = filters.map((filter) => `\n         AND ${filter}`).join('');

    // Annotated rather than asserted: `query` is untyped, so the row shape has
    // to be stated here — this SQL is the only place Postgres's column names
    // appear.
    const rows: ChunkRow[] = await this.chunksRepo.query(
      `SELECT id, source_type, lesson_id, course_id, title, content,
              embedding <=> $1::vector AS distance
         FROM ai_knowledge_chunks
        WHERE embedding IS NOT NULL${where}
        ORDER BY embedding <=> $1::vector
        LIMIT $${params.length}`,
      params,
    );

    return rows.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      lessonId: row.lesson_id,
      courseId: row.course_id ?? null,
      title: row.title,
      content: row.content,
      distance: Number(row.distance),
    }));
  }

  /**
   * Writes one `ai_retrieval_logs` row per real vector search. Best-effort and
   * awaited: the insert is a local single-row write next to a multi-second LLM
   * call, and awaiting keeps the log honest about what the request saw.
   */
  private async logSearch(
    text: string,
    options: KnowledgeSearchOptions,
    candidates: KnowledgeHit[],
    hits: KnowledgeHit[],
  ): Promise<void> {
    const distances = candidates.map((candidate) => candidate.distance);
    try {
      await this.logsRepo.insert({
        conversationId: options.logContext?.conversationId ?? null,
        lessonId: options.logContext?.lessonId ?? null,
        queryPreview: text.slice(0, QUERY_PREVIEW_LENGTH),
        candidateCount: candidates.length,
        hitCount: hits.length,
        bestDistance: distances[0] ?? null,
        distances,
      });
    } catch (err) {
      // The log informs tuning; losing one row to a transient write failure is
      // acceptable, failing the learner's message over it is not.
      this.logger.warn(
        `Retrieval log write failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private clampLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
      return DEFAULT_RETRIEVAL_LIMIT;
    }
    return Math.min(Math.floor(limit), MAX_RETRIEVAL_LIMIT);
  }
}
