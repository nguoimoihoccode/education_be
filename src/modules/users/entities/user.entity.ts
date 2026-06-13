import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '../../../common/enums/roles.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'password_hash', nullable: true })
  passwordHash: string;

  @Column({ nullable: true })
  name?: string;

  @Column({ unique: true, nullable: true, length: 50 })
  username?: string;

  @Column({ nullable: true })
  avatar?: string;

  @Column({ nullable: true })
  phone?: string | null;

  @Column({ name: 'provider', nullable: true })
  provider?: string;

  @Column({ name: 'provider_id', nullable: true, unique: true })
  providerId?: string;

  // Role-based access control
  @Column({
    type: 'simple-array',
    default: UserRole.USER,
  })
  roles: UserRole[];

  // Education specific fields
  @Column({ name: 'is_teacher', default: false })
  isTeacher: boolean;

  @Column({ name: 'teacher_verified', default: false })
  teacherVerified: boolean;

  @Column({ name: 'teacher_bio', type: 'text', nullable: true })
  teacherBio?: string;

  @Column({ name: 'last_seen_at', type: 'timestamp', nullable: true })
  lastSeenAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  // Helper method to check if user has a specific role
  hasRole(role: UserRole): boolean {
    return this.roles?.includes(role) || false;
  }

  // Helper method to check if user is a teacher
  isTeacherRole(): boolean {
    return (
      this.roles?.includes(UserRole.TEACHER) ||
      this.roles?.includes(UserRole.EDUCATION_ADMIN) ||
      this.roles?.includes(UserRole.ADMIN) ||
      false
    );
  }
}
