import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Lesson } from '../../education/entities/lesson.entity';
import { User } from '../../users/entities/user.entity';

export enum SlideDeckSourceType {
  LESSON = 'lesson',
  PROMPT = 'prompt',
}

export enum SlideDeckTemplate {
  NEON_CLASSROOM = 'neon-classroom',
  CLEAN_ACADEMIC = 'clean-academic',
  QUIZ_REVEAL = 'quiz-reveal',
}

export enum SlideDeckStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

export enum SlideType {
  TITLE = 'title',
  CONTENT = 'content',
  QUIZ = 'quiz',
  SUMMARY = 'summary',
}

export interface SlideContent {
  title?: string;
  subtitle?: string;
  bullets?: string[];
  question?: string;
  options?: string[];
  answer?: string;
  explanation?: string;
}

export interface SlideItem {
  id: string;
  order: number;
  type: SlideType;
  content: SlideContent;
  speakerNotes?: string;
}

@Entity('slide_decks')
export class SlideDeck {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'source_type', type: 'enum', enum: SlideDeckSourceType })
  sourceType: SlideDeckSourceType;

  @Column({ name: 'source_lesson_id', nullable: true })
  sourceLessonId?: string;

  @ManyToOne(() => Lesson, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'source_lesson_id' })
  sourceLesson?: Lesson;

  @Column({ type: 'enum', enum: SlideDeckTemplate })
  template: SlideDeckTemplate;

  @Column({
    type: 'enum',
    enum: SlideDeckStatus,
    default: SlideDeckStatus.DRAFT,
  })
  status: SlideDeckStatus;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  slides: SlideItem[];

  @Column({ name: 'created_by_id' })
  createdById: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
