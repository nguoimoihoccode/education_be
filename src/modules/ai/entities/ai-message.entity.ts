import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AiConversation } from './ai-conversation.entity';

export enum AiMessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

@Entity('ai_messages')
@Index('IDX_ai_messages_conversation_created', ['conversationId', 'createdAt'])
export class AiMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => AiConversation, (c) => c.messages, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'conversation_id',
    foreignKeyConstraintName: 'FK_ai_messages_conversation',
  })
  conversation: AiConversation;

  @Column({
    type: 'enum',
    enum: AiMessageRole,
    enumName: 'ai_message_role_enum',
  })
  role: AiMessageRole;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'token_count', type: 'integer', nullable: true })
  tokenCount?: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
