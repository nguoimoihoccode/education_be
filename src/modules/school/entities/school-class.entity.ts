import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { School } from './school.entity';
import { AcademicYear } from './academic-year.entity';
import { ClassMembership } from './class-membership.entity';

@Entity('school_classes')
@Unique('UQ_school_classes_name_year', ['schoolId', 'name', 'academicYearId'])
@Index('IDX_school_classes_school', ['schoolId'])
@Index('IDX_school_classes_homeroom', ['homeroomTeacherId'])
export class SchoolClass {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  name: string; // "6A"

  @Column({ type: 'smallint' })
  grade: number; // 1..12, or 0 for centre-style classes without grade

  @ManyToOne(() => AcademicYear, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'academic_year_id',
    foreignKeyConstraintName: 'FK_school_classes_academic_year',
  })
  academicYear: AcademicYear;

  @Column({ name: 'academic_year_id' })
  academicYearId: string;

  // Giáo viên chủ nhiệm — nullable until assigned
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'homeroom_teacher_id',
    foreignKeyConstraintName: 'FK_school_classes_homeroom_teacher',
  })
  homeroomTeacher?: User | null;

  @Column({ name: 'homeroom_teacher_id', type: 'integer', nullable: true })
  homeroomTeacherId?: number | null;

  @Column({ name: 'max_students', type: 'smallint', nullable: true })
  maxStudents?: number | null;

  @Column({ length: 50, nullable: true })
  room?: string;

  @Column({ default: true })
  active: boolean;

  @ManyToOne(() => School, (school) => school.classes, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_school_classes_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  @OneToMany(() => ClassMembership, (m) => m.class)
  students?: ClassMembership[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
