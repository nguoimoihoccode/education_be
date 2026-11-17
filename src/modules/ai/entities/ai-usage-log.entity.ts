import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One row per `/chat/completions` request the AI service sent: tutor chat,
 * quiz generation, wrong-answer explanations, coach summaries, vocabulary
 * enrichment. Append-only and without foreign keys, like `ai_retrieval_logs`:
 * deleting a user must not be blocked by an accounting row.
 *
 * `cost_micros` is micro-USD at the price configured when the call ran; `null`
 * means unknown (no price set, or the provider omitted usage).
 */
@Entity('ai_usage_logs')
@Index('IDX_ai_usage_logs_created_at', ['createdAt'])
@Index('IDX_ai_usage_logs_user_created', ['userId', 'createdAt'])
export class AiUsageLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'integer', nullable: true })
  userId?: number | null;

  @Column({ type: 'varchar', length: 32 })
  feature: string;

  @Column({ type: 'varchar', length: 128 })
  model: string;

  /** Host of the provider base URL (never the key or path). */
  @Column({ name: 'provider_host', type: 'varchar', length: 255 })
  providerHost: string;

  /** `ok` when a response came back, `error` when the request failed. */
  @Column({ type: 'varchar', length: 16 })
  status: string;

  @Column({ name: 'prompt_tokens', type: 'integer', nullable: true })
  promptTokens?: number | null;

  @Column({ name: 'completion_tokens', type: 'integer', nullable: true })
  completionTokens?: number | null;

  @Column({ name: 'total_tokens', type: 'integer', nullable: true })
  totalTokens?: number | null;

  @Column({
    name: 'cost_micros',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (v: number | null | undefined) => v,
      from: (v: string | null) => (v === null ? null : Number(v)),
    },
  })
  costMicros?: number | null;

  @Column({ name: 'latency_ms', type: 'integer', nullable: true })
  latencyMs?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
