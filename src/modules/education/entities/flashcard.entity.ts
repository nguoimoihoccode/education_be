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
import { FlashcardDeck } from './flashcard-deck.entity';
import { User } from '../../users/entities/user.entity';

@Entity('edu_flashcards')
@Index(['deckId'])
@Index(['userId'])
@Index(['front'])
@Index(['status'])
export class Flashcard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  front: string;

  @Column({ type: 'text', nullable: true })
  back: string;

  @Column({ nullable: true })
  pronunciation: string;

  @Column({ type: 'text', nullable: true })
  example: string;

  @Column({ type: 'text', nullable: true })
  exampleTranslation: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  audioUrl: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column({ nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: ['NEW', 'LEARNING', 'REVIEWING', 'MASTERED'],
    default: 'NEW',
  })
  status: 'NEW' | 'LEARNING' | 'REVIEWING' | 'MASTERED';

  @Column({ default: 1, type: 'smallint' })
  difficulty: number;

  @Column({ default: 0 })
  viewCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => FlashcardDeck)
  @JoinColumn({ name: 'deckId' })
  deck: FlashcardDeck;

  @Column()
  deckId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @Column({ nullable: true })
  sourceVocabularyId: string;

  @Column({ type: 'text', nullable: true, array: true })
  tags: string[];
}
