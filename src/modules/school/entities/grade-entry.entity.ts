import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ValueTransformer,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { School } from './school.entity';
import { SchoolClass } from './school-class.entity';
import { Subject } from './subject.entity';
import { HomeworkAssignment } from './homework-assignment.entity';

/** Loại bài kiểm tra theo quy chế VN (D2: đủ generic cho trung tâm ngoại ngữ). */
export enum GradeTestType {
  ORAL = 'oral',
  MIN15 = '15min',
  MIN45 = '45min',
  FINAL = 'final',
}

/** Hệ số mặc định theo loại bài — 15p/miệng ×1, 45p/cuối kỳ ×2. */
export const DEFAULT_COEFFICIENT: Record<GradeTestType, 1 | 2> = {
  [GradeTestType.ORAL]: 1,
  [GradeTestType.MIN15]: 1,
  [GradeTestType.MIN45]: 2,
  [GradeTestType.FINAL]: 2,
};

/** pg `numeric` về dạng string — transform để service/FE luôn thấy number. */
const oneDecimal: ValueTransformer = {
  to: (value?: number | null) =>
    value === undefined || value === null ? value : String(value),
  from: (value: string | null) => (value === null ? null : Number(value)),
};

/**
 * Một đầu điểm trong sổ điểm (docs/SCHOOL_PLATFORM_PLAN.md Phase 4).
 * `quizSessionId` là cầu nối Learning Hub: điểm quiz 0–100 → đầu điểm
 * 15 phút 0–10 khi bài giao có `countsAsGrade`. Không có FK sang
 * `edu_quiz_sessions` (cross-module, best-effort link); DB enforce
 * 1 session chỉ sinh 1 đầu điểm qua unique index trên quiz_session_id.
 */
@Entity('school_grades')
@Index('IDX_grades_school', ['schoolId'])
@Index('IDX_grades_student_subject', ['studentId', 'subjectId'])
@Index('IDX_grades_class_subject_term', ['classId', 'subjectId', 'term'])
export class GradeEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_grades_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  @ManyToOne(() => SchoolClass, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'class_id',
    foreignKeyConstraintName: 'FK_grades_class',
  })
  schoolClass: SchoolClass;

  @Column({ name: 'class_id' })
  classId: string;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'subject_id',
    foreignKeyConstraintName: 'FK_grades_subject',
  })
  subject: Subject;

  @Column({ name: 'subject_id' })
  subjectId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'student_id',
    foreignKeyConstraintName: 'FK_grades_student',
  })
  student: User;

  @Column({ name: 'student_id' })
  studentId: number;

  @Column({ name: 'test_type', type: 'varchar', length: 20 })
  testType: GradeTestType;

  // 1 | 2 — suy ra từ testType nếu giáo viên không chỉ định
  @Column({ type: 'smallint', default: 1 })
  coefficient: number;

  // 0..10, 1 chữ số thập phân (numeric(4,1))
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 1,
    transformer: oneDecimal,
  })
  score: number;

  // 'YYYY-MM-DD' — ngày kiểm tra (type 'date' như school_attendance)
  @Column({ type: 'date' })
  date: string;

  // Học kỳ 1 | 2
  @Column({ type: 'smallint', default: 1 })
  term: number;

  @Column({ name: 'quiz_session_id', type: 'uuid', nullable: true })
  quizSessionId?: string | null;

  // Đầu điểm tự sinh từ BTVN (homework) — xóa bài giao thì kéo theo điểm
  @ManyToOne(() => HomeworkAssignment, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({
    name: 'homework_id',
    foreignKeyConstraintName: 'FK_grades_homework',
  })
  homework?: HomeworkAssignment | null;

  @Column({ name: 'homework_id', type: 'uuid', nullable: true })
  homeworkId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
