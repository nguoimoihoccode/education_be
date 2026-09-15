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

@Entity('school_academic_years')
@Index('IDX_school_academic_years_school_active', ['schoolId', 'isActive'])
export class AcademicYear {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  name: string; // "2026-2027"

  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @Column({ name: 'is_active', default: false })
  isActive: boolean;

  @ManyToOne(() => School, (school) => school.academicYears, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_school_academic_years_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
