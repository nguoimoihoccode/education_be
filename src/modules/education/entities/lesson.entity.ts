import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Course } from './course.entity';
import { Vocabulary } from './vocabulary.entity';
import { Exercise } from './exercise.entity';
import { UserLesson } from './user-lesson.entity';

export enum LessonType {
  VOCABULARY = 'vocabulary',
  GRAMMAR = 'grammar',
  READING = 'reading',
  LISTENING = 'listening',
  SPEAKING = 'speaking',
  PRACTICE = 'practice',
  QUIZ = 'quiz',
}

@Entity('edu_lessons')
export class Lesson {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  content: string; // HTML or Markdown content

  @Column({
    type: 'enum',
    enum: LessonType,
    default: LessonType.VOCABULARY,
  })
  type: LessonType;

  @Column({ name: 'estimated_minutes', default: 15 })
  estimatedMinutes: number;

  @Column({ name: 'order_index', default: 0 })
  orderIndex: number;

  @Column({ default: true })
  active: boolean;

  @Column({ name: 'video_url', nullable: true })
  videoUrl: string;

  @Column({ name: 'audio_url', nullable: true })
  audioUrl: string;

  @ManyToOne(() => Course, (course) => course.lessons)
  @JoinColumn({ name: 'course_id' })
  course: Course;

  @Column({ name: 'course_id' })
  courseId: string;

  @OneToMany(() => Vocabulary, (vocabulary) => vocabulary.lesson)
  vocabularies: Vocabulary[];

  @OneToMany(() => Exercise, (exercise) => exercise.lesson)
  exercises: Exercise[];

  @OneToMany(() => UserLesson, (userLesson) => userLesson.lesson)
  userLessons: UserLesson[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
