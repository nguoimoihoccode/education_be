import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { School } from './school.entity';
import { Subject } from './subject.entity';
import { SchoolClass } from './school-class.entity';

/** Phân công: teacher teaches subject to class ("thầy Hùng dạy Toán 6A"). */
@Entity('school_teaching_assignments')
@Unique('UQ_assignment_teacher_subject_class', [
  'teacherId',
  'subjectId',
  'classId',
])
@Index('IDX_assignments_school', ['schoolId'])
@Index('IDX_assignments_teacher', ['teacherId'])
export class TeachingAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'teacher_id',
    foreignKeyConstraintName: 'FK_assignments_teacher',
  })
  teacher: User;

  @Column({ name: 'teacher_id' })
  teacherId: number;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'subject_id',
    foreignKeyConstraintName: 'FK_assignments_subject',
  })
  subject: Subject;

  @Column({ name: 'subject_id' })
  subjectId: string;

  @ManyToOne(() => SchoolClass, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'class_id',
    foreignKeyConstraintName: 'FK_assignments_class',
  })
  schoolClass: SchoolClass;

  @Column({ name: 'class_id' })
  classId: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_assignments_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
