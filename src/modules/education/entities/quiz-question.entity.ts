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
import { Quiz } from './quiz.entity';

@Entity('edu_quiz_questions')
@Index(['quizId'])
@Index(['type'])
@Index(['flashcardId'])
export class QuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  question: string;

  @Column({
    type: 'enum',
    enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'],
  })
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK';

  @Column({ type: 'json', nullable: true })
  options: string[];

  @Column()
  correctAnswer: string;

  @Column({ type: 'text', nullable: true })
  explanation: string;

  @Column({ default: 1 })
  points: number;

  @Column({ default: 0 })
  order: number;

  @Column({ nullable: true })
  flashcardId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Quiz)
  @JoinColumn({ name: 'quizId' })
  quiz: Quiz;

  @Column()
  quizId: string;
}
