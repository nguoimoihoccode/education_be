import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum EducationActivityType {
  SYSTEM = 'system',
  LEARNING = 'learning',
  PRACTICE = 'practice',
  SOCIAL = 'social',
  ACHIEVEMENT = 'achievement',
}

@Entity('edu_activity_logs')
@Index('IDX_edu_activity_logs_user_created', ['userId', 'createdAt'])
@Index('IDX_edu_activity_logs_type', ['type'])
export class EducationActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_edu_activity_logs_user',
  })
  user: User;

  @Column({
    type: 'enum',
    enum: EducationActivityType,
    enumName: 'edu_activity_type_enum',
  })
  type: EducationActivityType;

  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'text' })
  detail: string;

  @Column({ type: 'integer', default: 0 })
  xp: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
