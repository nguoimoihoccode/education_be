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

export enum ParentRelation {
  FATHER = 'father',
  MOTHER = 'mother',
  GUARDIAN = 'guardian',
}

export enum ParentLinkStatus {
  // GVCN just generated the code — parent hasn't claimed it yet
  PENDING = 'pending',
  // parent claimed the code AND GVCN approved (design D5)
  APPROVED = 'approved',
  // GVCN cut the link; parent loses access, row kept for history
  REVOKED = 'revoked',
}

/**
 * Liên kết phụ huynh ↔ học sinh (docs/SCHOOL_PLATFORM_PLAN.md Phase 2).
 * Flow (D5): GVCN sinh inviteCode (parentId null, status=pending) →
 * phụ huynh đăng ký + nhập mã (parentId được gán, vẫn pending) →
 * GVCN duyệt (approved) hoặc thu hồi (revoked).
 */
@Entity('school_parent_links')
@Unique('UQ_parent_links_code', ['inviteCode'])
@Index('IDX_parent_links_school', ['schoolId'])
@Index('IDX_parent_links_parent', ['parentId', 'status'])
@Index('IDX_parent_links_student', ['studentId'])
export class ParentLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => School, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'school_id',
    foreignKeyConstraintName: 'FK_parent_links_school',
  })
  school: School;

  @Column({ name: 'school_id' })
  schoolId: string;

  // null until the parent enters the invite code
  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'parent_id',
    foreignKeyConstraintName: 'FK_parent_links_parent',
  })
  parent?: User | null;

  @Column({ name: 'parent_id', type: 'integer', nullable: true })
  parentId?: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'student_id',
    foreignKeyConstraintName: 'FK_parent_links_student',
  })
  student: User;

  @Column({ name: 'student_id' })
  studentId: number;

  @Column({ type: 'varchar', length: 20 })
  relation: ParentRelation;

  @Column({ name: 'parent_name', type: 'varchar', length: 100, nullable: true })
  parentName?: string | null;

  @Column({ name: 'parent_phone', type: 'varchar', length: 30, nullable: true })
  parentPhone?: string | null;

  @Column({ name: 'invite_code', type: 'varchar', length: 20 })
  inviteCode: string;

  @Column({ type: 'varchar', length: 20, default: ParentLinkStatus.PENDING })
  status: ParentLinkStatus;

  // GVCN who approved (or revoked) this link
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'approved_by',
    foreignKeyConstraintName: 'FK_parent_links_approver',
  })
  approvedBy?: User | null;

  @Column({ name: 'approved_by', type: 'integer', nullable: true })
  approvedById?: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
