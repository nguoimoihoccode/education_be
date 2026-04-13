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
import { Language } from './language.entity';
import { Lesson } from './lesson.entity';
import { UserCourse } from './user-course.entity';

export enum CourseLevel {
  BEGINNER = 'beginner',
  ELEMENTARY = 'elementary',
  INTERMEDIATE = 'intermediate',
  UPPER_INTERMEDIATE = 'upper_intermediate',
  ADVANCED = 'advanced',
}

@Entity('edu_courses')
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'short_description', nullable: true })
  shortDescription: string;

  @Column({ nullable: true })
  thumbnail: string;

  @Column({
    type: 'enum',
    enum: CourseLevel,
    default: CourseLevel.BEGINNER,
  })
  level: CourseLevel;

  @Column({
    name: 'estimated_hours',
    type: 'decimal',
    precision: 5,
    scale: 1,
    default: 0,
  })
  estimatedHours: number;

  @Column({ name: 'total_lessons', default: 0 })
  totalLessons: number;

  @Column({ default: true })
  free: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ default: true })
  active: boolean;

  @Column({ default: 0 })
  order: number;

  @ManyToOne(() => Language, (language) => language.courses)
  @JoinColumn({ name: 'language_id' })
  language: Language;

  @Column({ name: 'language_id' })
  languageId: string;

  @OneToMany(() => Lesson, (lesson) => lesson.course)
  lessons: Lesson[];

  @OneToMany(() => UserCourse, (userCourse) => userCourse.course)
  userCourses: UserCourse[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
