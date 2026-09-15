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

/**
 * Học sinh thuộc lớp. Leaving (chuyển lớp / nghỉ học) sets leftAt —
 * never hard-delete so history (attendance, grades) stays attributable.
 */
@Entity('school_class_memberships')
@Unique('UQ_membership_class_student', ['classId', 'studentId'])
@Index('IDX_memberships_school', ['schoolId'])
@Index('IDX_memberships_student_active', ['studentId', 'leftAt'])
export class ClassMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SchoolClass, (cls) => cls.students, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'class_id',
    foreignKeyConstraintName: 'FK_memberships_class',
  })
  class: SchoolClass;

  @Column({ name: 'class_id' })
  classId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'student_id',
    foreignKeyConstraintName: 'FK_memberships_student',
  })
  student: User;

  @Column({ name: 'student_id' })
  studentId: number;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_memberships_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'now()' })
  joinedAt: Date;

  // null = đang học; set = đã rời lớp (reactivation clears it)
  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
