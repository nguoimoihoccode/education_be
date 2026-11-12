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
// One row per identifier. Including the IP here used to let a caller start a
// fresh counter by presenting a new address, which is exactly what an attacker
// rotating X-Forwarded-For wants.
@Unique(['identifier'])
export class AuthLoginAttempt {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  identifier: string;

  // The last address that failed, kept for review only -- never part of the key.
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
