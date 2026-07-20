import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AiMessage } from './ai-message.entity';

@Entity('ai_conversations')
@Index('IDX_ai_conversations_user_updated', ['userId', 'updatedAt'])
export class AiConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_ai_conversations_user',
  })
  user: User;

  @Column({ type: 'varchar', length: 120, default: 'New Chat' })
  title: string;

  @Column({ name: 'lesson_id', type: 'varchar', length: 64, nullable: true })
  lessonId?: string | null;

  @OneToMany(() => AiMessage, (m) => m.conversation)
  messages: AiMessage[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
