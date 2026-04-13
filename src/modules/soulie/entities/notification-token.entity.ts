import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('notification_tokens')
export class NotificationToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  token: string;

  @Column({
    type: 'enum',
    enum: ['android', 'ios'],
  })
  platform: 'android' | 'ios';

  @CreateDateColumn()
  createdAt: Date;
}
