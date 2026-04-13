import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Lesson } from './lesson.entity';

export enum ExerciseType {
  MULTIPLE_CHOICE = 'multiple_choice',
  FILL_BLANK = 'fill_blank',
  MATCHING = 'matching',
  TRANSLATION = 'translation',
  LISTENING = 'listening',
  SPEAKING = 'speaking',
  ORDERING = 'ordering',
  TRUE_FALSE = 'true_false',
}

@Entity('edu_exercises')
export class Exercise {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ExerciseType,
    default: ExerciseType.MULTIPLE_CHOICE,
  })
  type: ExerciseType;

  @Column({ type: 'text' })
  question: string;

  @Column({ type: 'jsonb', nullable: true })
  options: any; // Array of options for multiple choice, etc.

  @Column({ type: 'jsonb' })
  answer: any; // Correct answer(s)

  @Column({ type: 'text', nullable: true })
  explanation: string;

  @Column({ name: 'audio_url', nullable: true })
  audioUrl: string;

  @Column({ name: 'image_url', nullable: true })
  imageUrl: string;

  @Column({ default: 10 })
  points: number;

  @Column({ default: 1 })
  difficulty: number; // 1-5

  @Column({ name: 'order_index', default: 0 })
  orderIndex: number;

  @ManyToOne(() => Lesson, (lesson) => lesson.exercises)
  @JoinColumn({ name: 'lesson_id' })
  lesson: Lesson;

  @Column({ name: 'lesson_id' })
  lessonId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
