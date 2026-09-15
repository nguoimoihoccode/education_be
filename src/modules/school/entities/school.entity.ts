import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AcademicYear } from './academic-year.entity';
import { Subject } from './subject.entity';
import { SchoolClass } from './school-class.entity';

export const DEFAULT_PERIOD_CONFIG = {
  periodsPerDay: 5,
  days: [2, 3, 4, 5, 6, 7], // Monday..Saturday
};

@Entity('schools')
export class School {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  code: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ length: 30, nullable: true })
  phone?: string;

  @Column({ name: 'current_academic_year_id', type: 'uuid', nullable: true })
  currentAcademicYearId?: string;

  // Informational: who bootstrapped the school. Authorization comes from
  // UserRole.PRINCIPAL, not from this column.
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'principal_id',
    foreignKeyConstraintName: 'FK_schools_principal',
  })
  principal?: User | null;

  @Column({ name: 'principal_id', type: 'integer', nullable: true })
  principalId?: number | null;

  // { periodsPerDay, days } — drives timetable grids (Phase 3)
  @Column({
    name: 'period_config',
    type: 'jsonb',
    nullable: true,
    default: () => `'${JSON.stringify(DEFAULT_PERIOD_CONFIG)}'`,
  })
  periodConfig?: { periodsPerDay: number; days: number[] } | null;

  @OneToMany(() => AcademicYear, (year) => year.school)
  academicYears?: AcademicYear[];

  @OneToMany(() => Subject, (subject) => subject.school)
  subjects?: Subject[];

  @OneToMany(() => SchoolClass, (cls) => cls.school)
  classes?: SchoolClass[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
