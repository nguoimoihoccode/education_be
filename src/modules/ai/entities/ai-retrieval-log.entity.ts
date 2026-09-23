import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One row per vector search the retrieval tier actually ran (gap #7 of the RAG
 * plan): the candidate distances it saw, how many passed
 * `MAX_COSINE_DISTANCE`, and enough context to judge why.
 *
 * The point is tuning the threshold with evidence instead of intuition. After a
 * few weeks of traffic, `GET /ai/knowledge/retrieval-stats` shows where the
 * best candidate per query sits: mass just above the threshold with a high
 * zero-hit rate means the threshold is too tight; mass far below it with noisy
 * answers means it is too loose. `MAX_COSINE_DISTANCE` should not move until
 * this table says so.
 *
 * Append-only, and deliberately free of foreign keys — a log must never
 * outlive its usefulness by blocking a delete, and `conversation_id` /
 * `lesson_id` are pointers for human reading, not integrity. `query_preview`
 * duplicates learner text that `ai_message` already stores, truncated to 300
 * characters: far enough to see what was asked, short enough to keep this
 * table lean.
 *
 * Rows are pruned by the nightly reindex task after
 * `RETRIEVAL_LOG_RETENTION_DAYS`, so the table stays bounded without a cron of
 * its own.
 */
@Entity('ai_retrieval_logs')
@Index('IDX_ai_retrieval_logs_created_at', ['createdAt'])
export class AiRetrievalLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid', nullable: true })
  conversationId?: string | null;

  /** The lesson context the conversation sat in, if any. Not a search filter. */
  @Column({ name: 'lesson_id', type: 'uuid', nullable: true })
  lessonId?: string | null;

  @Column({ name: 'query_preview', type: 'varchar', length: 300 })
  queryPreview: string;

  /** Rows the nearest-neighbour scan returned, before any threshold. */
  @Column({ name: 'candidate_count', type: 'integer' })
  candidateCount: number;

  /** Candidates within `MAX_COSINE_DISTANCE` that actually reached the prompt. */
  @Column({ name: 'hit_count', type: 'integer' })
  hitCount: number;

  /** Closest candidate distance; null when the scan found no rows at all. */
  @Column({ name: 'best_distance', type: 'real', nullable: true })
  bestDistance?: number | null;

  /** All candidate distances, ascending — the near-misses are the signal. */
  @Column({ type: 'jsonb' })
  distances: number[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
