import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { FlashcardDeck } from './flashcard-deck.entity';

export interface ReviewResult {
  flashcardId: string;
  quality: number;
  isCorrect: boolean;
  timeSpent: number;
}

@Entity('edu_flashcard_review_sessions')
@Index(['userId', 'startedAt'])
@Index(['userId', 'completed'])
export class ReviewSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ['DAILY', 'DECK', 'CUSTOM'],
    default: 'DAILY',
  })
  type: 'DAILY' | 'DECK' | 'CUSTOM';

  @Column({ default: 0 })
  totalCards: number;

  @Column({ default: 0 })
  correctCards: number;

  @Column({ default: 0 })
  wrongCards: number;

  @Column({ default: 0 })
  skippedCards: number;

  @Column({ type: 'int', default: 0 })
  timeSpent: number;

  @Column({ default: 0 })
  xpEarned: number;

  @Column({ type: 'json', nullable: true })
  results: ReviewResult[];

  @Column({ default: false })
  completed: boolean;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => FlashcardDeck, { nullable: true })
  @JoinColumn({ name: 'deckId' })
  deck: FlashcardDeck;

  @Column({ nullable: true })
  deckId: string;
}
