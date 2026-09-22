import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { CacheService } from '../../common/cache/cache.service';
import { EmbeddingConfig, EmbeddingService } from './embedding.service';
import {
  AiKnowledgeChunk,
  AiKnowledgeSourceType,
} from './entities/ai-knowledge-chunk.entity';
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
 */
export const MAX_COSINE_DISTANCE = 0.75;

/**
 * Query embeddings are cached because the same handful of questions gets asked
 * over and over across a class, and the vector depends only on the text and the
 * model — never on who is asking.
 */
export const QUERY_EMBEDDING_CACHE_TTL_SECONDS = 3600;
const QUERY_EMBEDDING_CACHE_PREFIX = 'ai:rag:q:';

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

@Injectable()
export class KnowledgeRetrievalService {
  private readonly logger = new Logger(KnowledgeRetrievalService.name);

  constructor(
    @InjectRepository(AiKnowledgeChunk)
    private readonly chunksRepo: Repository<AiKnowledgeChunk>,
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

    return this.nearest(vector, options);
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

  private async nearest(
    vector: number[],
    options: KnowledgeSearchOptions,
  ): Promise<KnowledgeHit[]> {
    const params: unknown[] = [formatVector(vector), MAX_COSINE_DISTANCE];
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

    params.push(this.clampLimit(options.limit));
    const where = filters.map((filter) => `\n         AND ${filter}`).join('');

    // The distance filter is in SQL rather than applied to the rows afterwards:
    // applied afterwards it would silently shrink the result set below the limit,
    // so a question with three good matches would come back with three.
    // Annotated rather than asserted: `query` is untyped, so the row shape has to be
    // stated here — this SQL is the only place Postgres's column names appear.
    const rows: ChunkRow[] = await this.chunksRepo.query(
      `SELECT id, source_type, lesson_id, course_id, title, content,
              embedding <=> $1::vector AS distance
         FROM ai_knowledge_chunks
        WHERE embedding IS NOT NULL
          AND embedding <=> $1::vector <= $2${where}
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

  private clampLimit(limit: number | undefined): number {
    if (limit === undefined || !Number.isFinite(limit) || limit < 1) {
      return DEFAULT_RETRIEVAL_LIMIT;
    }
    return Math.min(Math.floor(limit), MAX_RETRIEVAL_LIMIT);
  }
}
