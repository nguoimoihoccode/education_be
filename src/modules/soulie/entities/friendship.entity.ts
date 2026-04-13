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

export enum SoulieFriendshipStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  BLOCKED = 'blocked',
}

@Entity('soulie_friendships')
@Unique(['requesterId', 'addresseeId'])
@Index(['requesterId'])
@Index(['addresseeId'])
@Index(['status'])
export class SoulieFriendship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requester_id' })
  requesterId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @Column({ name: 'addressee_id' })
  addresseeId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'addressee_id' })
  addressee: User;

  @Column({
    type: 'enum',
    enum: SoulieFriendshipStatus,
    enumName: 'soulie_friendship_status_enum',
    default: SoulieFriendshipStatus.PENDING,
  })
  status: SoulieFriendshipStatus;

  @Column({ name: 'responded_at', type: 'timestamp', nullable: true })
  respondedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
