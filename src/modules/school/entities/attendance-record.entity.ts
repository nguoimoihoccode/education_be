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
import { SchoolClass } from './school-class.entity';

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  // nghỉ có phép — GVCN ghi chú lý do vào `note`
  EXCUSED = 'excused',
}

/**
 * Điểm danh một học sinh trong một tiết (docs/SCHOOL_PLATFORM_PLAN.md
 * Phase 3). Một lần "take" của GVCN = upsert cả lớp theo
 * (classId, date, periodNumber, studentId) — unique constraint dưới DB.
 */
@Entity('school_attendance')
@Unique('UQ_attendance_class_date_period_student', [
  'classId',
  'date',
  'periodNumber',
  'studentId',
])
@Index('IDX_attendance_school', ['schoolId'])
@Index('IDX_attendance_class_date', ['classId', 'date'])
@Index('IDX_attendance_student_date', ['studentId', 'date'])
export class AttendanceRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_attendance_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  @ManyToOne(() => SchoolClass, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'class_id',
    foreignKeyConstraintName: 'FK_attendance_class',
  })
  schoolClass: SchoolClass;

  @Column({ name: 'class_id' })
  classId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'student_id',
    foreignKeyConstraintName: 'FK_attendance_student',
  })
  student: User;

  @Column({ name: 'student_id' })
  studentId: number;

  // 'date' (không phải timestamptz) — điểm danh theo ngày dương lịch, múi giờ
  // không có nghĩa ở đây. TypeORM trả về chuỗi 'YYYY-MM-DD'.
  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'period_number', type: 'smallint' })
  periodNumber: number;

  @Column({ type: 'varchar', length: 20 })
  status: AttendanceStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
