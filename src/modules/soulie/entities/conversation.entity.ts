import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { SoulieMessageType } from './message.entity';

@Entity('soulie_conversations')
@Unique(['participantOneId', 'participantTwoId'])
@Index(['participantOneId'])
@Index(['participantTwoId'])
@Index(['lastMessageAt'])
export class SoulieConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'participant_one_id' })
  participantOneId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participant_one_id' })
  participantOne: User;

  @Column({ name: 'participant_two_id' })
  participantTwoId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participant_two_id' })
  participantTwo: User;

  @Column({ name: 'last_message_text', type: 'text', nullable: true })
  lastMessageText?: string | null;

  @Column({
    name: 'last_message_type',
    type: 'enum',
    enum: SoulieMessageType,
    enumName: 'soulie_message_type_enum',
    nullable: true,
  })
  lastMessageType?: SoulieMessageType | null;

  @Column({ name: 'last_message_at', type: 'timestamp', nullable: true })
  lastMessageAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
