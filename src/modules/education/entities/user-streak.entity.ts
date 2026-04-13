import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('edu_user_streaks')
@Unique(['userId'])
export class UserStreak {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'current_streak', default: 0 })
  currentStreak: number; // Current consecutive days

  @Column({ name: 'longest_streak', default: 0 })
  longestStreak: number; // Best streak ever

  @Column({ name: 'total_days', default: 0 })
  totalDays: number; // Total days studied

  @Column({ name: 'last_activity_date', type: 'date', nullable: true })
  lastActivityDate: Date;

  @Column({ name: 'total_xp', default: 0 })
  totalXp: number; // Experience points

  @Column({ default: 1 })
  level: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
