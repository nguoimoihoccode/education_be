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
import { User } from '../../users/entities/user.entity';

@Entity('soulie_moments')
@Index(['senderId'])
@Index(['recipientId'])
@Index(['createdAt'])
export class SoulieMoment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sender_id' })
  senderId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ name: 'recipient_id' })
  recipientId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_id' })
  recipient: User;

  @Column({ type: 'text', nullable: true })
  caption?: string | null;

  @Column({ name: 'image_url', type: 'varchar', nullable: true })
  imageUrl?: string | null;

  @Column({ name: 'thumbnail_url', type: 'varchar', nullable: true })
  thumbnailUrl?: string | null;

  @Column({ name: 'image_width', type: 'integer', nullable: true })
  imageWidth?: number | null;

  @Column({ name: 'image_height', type: 'integer', nullable: true })
  imageHeight?: number | null;

  @Column({ name: 'mime_type', type: 'varchar', nullable: true })
  mimeType?: string | null;

  @Column({ name: 'opened_at', type: 'timestamp', nullable: true })
  openedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
