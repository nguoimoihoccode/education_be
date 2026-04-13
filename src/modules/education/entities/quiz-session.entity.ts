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
import { Quiz } from './quiz.entity';

export interface QuizAnswer {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeSpent: number;
  points: number;
}

@Entity('edu_quiz_sessions')
@Index(['userId', 'quizId'])
@Index(['userId', 'startedAt'])
export class QuizSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 0 })
  score: number;

  @Column({ default: 0 })
  totalPoints: number;

  @Column({ default: 0 })
  earnedPoints: number;

  @Column({ default: 0 })
  correctAnswers: number;

  @Column({ default: 0 })
  wrongAnswers: number;

  @Column({ default: 0 })
  skippedAnswers: number;

  @Column({ type: 'int', default: 0 })
  timeSpent: number;

  @Column({ default: false })
  passed: boolean;

  @Column({ default: false })
  completed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'json', nullable: true })
  answers: QuizAnswer[];

  @Column({ default: 0 })
  attemptNumber: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @ManyToOne(() => Quiz)
  @JoinColumn({ name: 'quizId' })
  quiz: Quiz;

  @Column()
  quizId: string;
}
