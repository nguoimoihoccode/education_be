import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SoulieConversation } from './conversation.entity';

export enum SoulieMessageType {
  TEXT = 'text',
  PHOTO = 'photo',
  REACTION = 'reaction',
}

@Entity('soulie_messages')
@Index(['conversationId', 'createdAt'])
@Index(['senderId'])
export class SoulieMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => SoulieConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: SoulieConversation;

  @Column({ name: 'sender_id' })
  senderId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({
    type: 'enum',
    enum: SoulieMessageType,
    enumName: 'soulie_message_type_enum',
    default: SoulieMessageType.TEXT,
  })
  type: SoulieMessageType;

  @Column({ type: 'text', nullable: true })
  text?: string | null;

  @Column({ name: 'media_url', type: 'varchar', nullable: true })
  mediaUrl?: string | null;

  @Column({ name: 'thumbnail_url', type: 'varchar', nullable: true })
  thumbnailUrl?: string | null;

  @Column({ name: 'media_width', type: 'integer', nullable: true })
  mediaWidth?: number | null;

  @Column({ name: 'media_height', type: 'integer', nullable: true })
  mediaHeight?: number | null;

  @Column({ name: 'mime_type', type: 'varchar', nullable: true })
  mimeType?: string | null;

  @Column({ name: 'seen_at', type: 'timestamp', nullable: true })
  seenAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
