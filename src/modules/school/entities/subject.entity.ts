import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { School } from './school.entity';

@Entity('school_subjects')
@Index('IDX_school_subjects_school', ['schoolId'])
export class Subject {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 30 })
  code: string; // "TOAN", "ENG8", "HSK4" — free-form per school

  @Column({ length: 7, nullable: true })
  color?: string; // "#8b5cf6" — timetable chip color

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => School, (school) => school.subjects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_school_subjects_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
