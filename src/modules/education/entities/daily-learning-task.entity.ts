import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

@Entity('edu_daily_learning_tasks')
@Unique(['userId', 'date', 'taskId'])
export class DailyLearningTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id' })
  userId: string;

  @Index()
  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'task_id' })
  taskId: string;

  @Column({ name: 'task_type' })
  taskType: string;

  @Column({ name: 'target_url' })
  targetUrl: string;

  @Column({ default: false })
  completed: boolean;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
