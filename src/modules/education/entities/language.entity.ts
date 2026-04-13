import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Course } from './course.entity';

@Entity('edu_languages')
export class Language {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // 'en', 'ja', 'ko', 'zh', 'vi'

  @Column()
  name: string; // 'English', 'Japanese', 'Korean'

  @Column({ name: 'native_name' })
  nativeName: string; // '英語', '日本語', '한국어'

  @Column({ nullable: true })
  flag: string; // Emoji flag or icon URL

  @Column({ default: true })
  active: boolean;

  @Column({ default: 0 })
  order: number;

  @OneToMany(() => Course, (course) => course.language)
  courses: Course[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
