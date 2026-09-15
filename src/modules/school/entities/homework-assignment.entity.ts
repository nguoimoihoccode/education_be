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
import { User } from '../../users/entities/user.entity';
import { School } from './school.entity';
import { SchoolClass } from './school-class.entity';
import { Subject } from './subject.entity';

/** Bài giao trỏ tới tài nguyên Learning Hub đã tồn tại. */
export enum HomeworkTargetType {
  QUIZ = 'quiz',
  DECK = 'deck',
}

/**
 * BTVN giáo viên giao cho lớp (docs/SCHOOL_PLATFORM_PLAN.md Phase 4).
 * `targetType`/`targetId` tham chiếu quiz hoặc flashcard deck có sẵn —
 * không có FK vì bảng thuộc module education. Khi HS làm xong quiz, nếu
 * `countsAsGrade` bật thì một GradeEntry (15 phút) được sinh tự động,
 * liên kết qua `GradeEntry.homeworkId`.
 */
@Entity('school_homework')
@Index('IDX_homework_school', ['schoolId'])
@Index('IDX_homework_class_due', ['classId', 'dueDate'])
@Index('IDX_homework_teacher', ['teacherId'])
export class HomeworkAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_homework_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  @ManyToOne(() => SchoolClass, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'class_id',
    foreignKeyConstraintName: 'FK_homework_class',
  })
  schoolClass: SchoolClass;

  @Column({ name: 'class_id' })
  classId: string;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'subject_id',
    foreignKeyConstraintName: 'FK_homework_subject',
  })
  subject: Subject;

  @Column({ name: 'subject_id' })
  subjectId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'teacher_id',
    foreignKeyConstraintName: 'FK_homework_teacher',
  })
  teacher: User;

  @Column({ name: 'teacher_id' })
  teacherId: number;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  // Deadline có cả giờ (HS nộp trong ngày) — dùng timestamp, không phải 'date'
  @Column({ name: 'due_date', type: 'timestamp' })
  dueDate: Date;

  @Column({ name: 'target_type', type: 'varchar', length: 10 })
  targetType: HomeworkTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  // Bật = hoàn thành quiz của bài này tự sinh đầu điểm 15 phút
  @Column({ name: 'counts_as_grade', type: 'boolean', default: false })
  countsAsGrade: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
