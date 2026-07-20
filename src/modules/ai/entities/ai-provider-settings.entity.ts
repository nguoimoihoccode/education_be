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

@Entity('ai_provider_settings')
export class AiProviderSettings {
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

  @Column({ name: 'max_tokens', type: 'integer', nullable: true })
  maxTokens?: number | null;

  @Column({ type: 'double precision', nullable: true })
  temperature?: number | null;

  @Column({ name: 'updated_by_user_id', type: 'integer', nullable: true })
  updatedByUserId?: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'updated_by_user_id',
    foreignKeyConstraintName: 'FK_ai_provider_settings_updated_by',
  })
  updatedBy?: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
