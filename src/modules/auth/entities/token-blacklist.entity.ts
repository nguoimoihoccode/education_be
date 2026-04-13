import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('token_blacklist')
export class TokenBlacklist {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Index()
  token: string;

  @Column()
  userId: number;

  @Column({ type: 'varchar', length: 20 })
  tokenType: 'access' | 'refresh';

  @Column({ type: 'text', nullable: true })
  reason: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
