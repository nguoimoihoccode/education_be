import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Vocabulary } from './vocabulary.entity';

export enum VocabularyStatus {
  NEW = 'new',
  LEARNING = 'learning',
  REVIEWING = 'reviewing',
  MASTERED = 'mastered',
}

@Entity('edu_user_vocabularies')
@Unique(['userId', 'vocabularyId'])
export class UserVocabulary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Vocabulary, (vocabulary) => vocabulary.userVocabularies)
  @JoinColumn({ name: 'vocabulary_id' })
  vocabulary: Vocabulary;

  @Column({ name: 'vocabulary_id' })
  vocabularyId: string;

  @Column({
    type: 'enum',
    enum: VocabularyStatus,
    default: VocabularyStatus.NEW,
  })
  status: VocabularyStatus;

  // Spaced Repetition System (SRS) fields
  @Column({
    name: 'ease_factor',
    type: 'decimal',
    precision: 4,
    scale: 2,
    default: 2.5,
  })
  easeFactor: number;

  @Column({ default: 0 })
  interval: number; // Days until next review

  @Column({ default: 0 })
  repetitions: number;

  @Column({ name: 'next_review', type: 'timestamp', nullable: true })
  nextReview: Date;

  @Column({ name: 'last_reviewed', type: 'timestamp', nullable: true })
  lastReviewed: Date;

  @Column({ name: 'correct_count', default: 0 })
  correctCount: number;

  @Column({ name: 'wrong_count', default: 0 })
  wrongCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
