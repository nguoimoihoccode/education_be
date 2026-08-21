import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('auth_login_attempts')
@Unique(['identifier', 'ipAddress'])
export class AuthLoginAttempt {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  identifier: string;

  @Column({ name: 'ip_address' })
  @Index()
  ipAddress: string;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'locked_until', type: 'timestamp', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_attempt_at', type: 'timestamp' })
  lastAttemptAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
