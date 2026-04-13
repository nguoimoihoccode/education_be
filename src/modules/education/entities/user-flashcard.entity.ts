import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Flashcard } from './flashcard.entity';
import { FlashcardDeck } from './flashcard-deck.entity';

@Entity('edu_user_flashcards')
@Index(['userId', 'flashcardId'])
@Index(['userId', 'nextReview'])
@Unique(['userId', 'flashcardId'])
export class UserFlashcard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ default: 2.5, type: 'decimal', precision: 3, scale: 2 })
  easeFactor: number;

  @Column({ default: 0 })
  interval: number;

  @Column({ default: 0 })
  repetitions: number;

  @Column({ type: 'timestamp', nullable: true })
  nextReview: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastReviewed: Date;

  @Column({ default: 0 })
  correctCount: number;

  @Column({ default: 0 })
  wrongCount: number;

  @Column({ default: 0 })
  totalReviews: number;

  @Column({ type: 'timestamp', nullable: true })
  firstReviewed: Date;

  @Column({ default: 0 })
  streak: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => Flashcard)
  @JoinColumn({ name: 'flashcardId' })
  flashcard: Flashcard;

  @Column()
  flashcardId: string;

  @ManyToOne(() => FlashcardDeck)
  @JoinColumn({ name: 'deckId' })
  deck: FlashcardDeck;

  @Column()
  deckId: string;
}
