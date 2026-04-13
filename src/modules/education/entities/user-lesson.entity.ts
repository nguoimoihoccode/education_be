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
import { Lesson } from './lesson.entity';

@Entity('edu_user_lessons')
@Unique(['userId', 'lessonId'])
export class UserLesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Lesson, (lesson) => lesson.userLessons)
  @JoinColumn({ name: 'lesson_id' })
  lesson: Lesson;

  @Column({ name: 'lesson_id' })
  lessonId: string;

  @Column({ default: false })
  completed: boolean;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ name: 'time_spent', default: 0 })
  timeSpent: number; // in seconds

  @Column({
    name: 'exercise_score',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  exerciseScore: number; // Score from exercises 0-100

  @Column({ name: 'attempts', default: 0 })
  attempts: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
