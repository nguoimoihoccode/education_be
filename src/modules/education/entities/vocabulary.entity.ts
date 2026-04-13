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
import { Lesson } from './lesson.entity';
import { UserVocabulary } from './user-vocabulary.entity';

@Entity('edu_vocabularies')
export class Vocabulary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  word: string; // The word to learn

  @Column()
  meaning: string; // Translation/meaning

  @Column({ nullable: true })
  pronunciation: string; // IPA or romanization

  @Column({ name: 'audio_url', nullable: true })
  audioUrl: string; // Audio pronunciation

  @Column({ name: 'image_url', nullable: true })
  imageUrl: string; // Visual representation

  @Column({ type: 'text', nullable: true })
  example: string; // Example sentence

  @Column({ name: 'example_translation', type: 'text', nullable: true })
  exampleTranslation: string;

  @Column({ nullable: true })
  notes: string; // Additional notes

  @Column({ name: 'part_of_speech', nullable: true })
  partOfSpeech: string; // noun, verb, adjective, etc.

  @Column({ default: 1 })
  difficulty: number; // 1-5 difficulty level

  @Column({ name: 'order_index', default: 0 })
  orderIndex: number;

  @ManyToOne(() => Lesson, (lesson) => lesson.vocabularies)
  @JoinColumn({ name: 'lesson_id' })
  lesson: Lesson;

  @Column({ name: 'lesson_id' })
  lessonId: string;

  @OneToMany(() => UserVocabulary, (userVocab) => userVocab.vocabulary)
  userVocabularies: UserVocabulary[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
