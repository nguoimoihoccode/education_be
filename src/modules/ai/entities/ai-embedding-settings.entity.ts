import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * Singleton row (like `ai_provider_settings`) holding the embedding provider.
 *
 * Deliberately a separate table rather than more columns on the chat settings:
 * the two providers are configured and rotated independently, and Groq — the
 * default chat provider — has no embeddings endpoint at all, so there is no
 * world where one row could describe both.
 */
@Entity('ai_embedding_settings')
export class AiEmbeddingSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'base_url', type: 'varchar', length: 512, nullable: true })
  baseUrl?: string | null;

  @Column({ name: 'api_key_encrypted', type: 'text', nullable: true })
  apiKeyEncrypted?: string | null;

  @Column({ name: 'api_key_last4', type: 'varchar', length: 4, nullable: true })
  apiKeyLast4?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  model?: string | null;

  /**
   * Width of the vectors this model returns. It must equal the `embedding`
   * column's width, so changing it is not a config tweak — the corpus has to be
   * re-embedded and the column altered to match.
   */
  @Column({ type: 'integer', nullable: true })
  dimensions?: number | null;

  @Column({ name: 'updated_by_user_id', type: 'integer', nullable: true })
  updatedByUserId?: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'updated_by_user_id',
    foreignKeyConstraintName: 'FK_ai_embedding_settings_updated_by',
  })
  updatedBy?: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
