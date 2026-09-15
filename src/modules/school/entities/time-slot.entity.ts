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
import { AcademicYear } from './academic-year.entity';
import { Subject } from './subject.entity';
import { SchoolClass } from './school-class.entity';

/**
 * Một ô thời khoá biểu (docs/SCHOOL_PLATFORM_PLAN.md Phase 3):
 * "lớp 6A học Toán với thầy Hùng, Thứ 2 tiết 3".
 *
 * weekday follows the plan: 1 = Chủ nhật, 2..7 = Thứ 2..Thứ 7.
 * A class can hold at most ONE slot per (weekday, periodNumber) — enforced by
 * a unique constraint; teacher/room clashes ACROSS classes are caught by
 * `timetable-conflict.policy` before write (they can't be one DB constraint
 * because null rooms must not clash).
 */
@Entity('school_time_slots')
@Unique('UQ_time_slots_class_weekday_period', [
  'classId',
  'weekday',
  'periodNumber',
])
@Index('IDX_time_slots_school', ['schoolId'])
@Index('IDX_time_slots_teacher_slot', ['teacherId', 'weekday', 'periodNumber'])
export class TimeSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_time_slots_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  @ManyToOne(() => SchoolClass, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'class_id',
    foreignKeyConstraintName: 'FK_time_slots_class',
  })
  schoolClass: SchoolClass;

  @Column({ name: 'class_id' })
  classId: string;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'subject_id',
    foreignKeyConstraintName: 'FK_time_slots_subject',
  })
  subject: Subject;

  @Column({ name: 'subject_id' })
  subjectId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'teacher_id',
    foreignKeyConstraintName: 'FK_time_slots_teacher',
  })
  teacher: User;

  @Column({ name: 'teacher_id' })
  teacherId: number;

  // Denormalized from the class so year-scoped queries don't need a join.
  @ManyToOne(() => AcademicYear, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'academic_year_id',
    foreignKeyConstraintName: 'FK_time_slots_academic_year',
  })
  academicYear: AcademicYear;

  @Column({ name: 'academic_year_id' })
  academicYearId: string;

  @Column({ type: 'smallint' })
  weekday: number; // 1..7 (1 = Sunday, 2 = Monday, ...)

  @Column({ name: 'period_number', type: 'smallint' })
  periodNumber: number; // 1..school.periodConfig.periodsPerDay

  @Column({ type: 'varchar', length: 50, nullable: true })
  room?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
