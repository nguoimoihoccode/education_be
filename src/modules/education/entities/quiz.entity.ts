import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { QuizQuestion } from './quiz-question.entity';
import { QuizSession } from './quiz-session.entity';

@Entity('edu_quizzes')
@Index(['userId'])
@Index(['topic'])
@Index(['questionType'])
export class Quiz {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  topic: string;

  @Column({
    type: 'enum',
    enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED'],
    default: 'MIXED',
  })
  questionType: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MIXED';

  @Column({ default: 10 })
  questionCount: number;

  @Column({ default: 60 })
  timeLimit: number;

  @Column({ default: 0 })
  passingScore: number;

  @Column({
    type: 'enum',
    enum: ['EASY', 'MEDIUM', 'HARD', 'MIXED'],
    default: 'MIXED',
  })
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';

  @Column({ default: true })
  isPublic: boolean;

  @Column({ default: true })
  shuffleQuestions: boolean;

  @Column({ default: true })
  shuffleAnswers: boolean;

  @Column({ default: false })
  showCorrectAnswer: boolean;

  @Column({ default: false })
  allowRetry: boolean;

  @Column({ default: 0 })
  maxRetries: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: number;

  @OneToMany(() => QuizQuestion, (question) => question.quiz)
  questions: QuizQuestion[];

  @OneToMany(() => QuizSession, (session) => session.quiz)
  sessions: QuizSession[];
}
