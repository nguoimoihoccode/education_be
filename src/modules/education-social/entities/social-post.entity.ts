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

export enum EducationSocialPostType {
  ACHIEVEMENT = 'achievement',
  QUESTION = 'question',
  SHARE = 'share',
  MILESTONE = 'milestone',
}

@Entity('edu_social_posts')
@Index('IDX_edu_social_posts_author', ['authorId'])
@Index('IDX_edu_social_posts_created', ['createdAt'])
@Index('IDX_edu_social_posts_type_created', ['type', 'createdAt'])
export class EducationSocialPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'author_id', type: 'integer' })
  authorId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'author_id',
    foreignKeyConstraintName: 'FK_edu_social_posts_author',
  })
  author: User;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'image_url', type: 'varchar', nullable: true })
  imageUrl?: string | null;

  @Column({
    type: 'enum',
    enum: EducationSocialPostType,
    enumName: 'edu_social_post_type_enum',
  })
  type: EducationSocialPostType;

  @Index('IDX_edu_social_posts_tags', { synchronize: false })
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  @Column({ name: 'shares_count', type: 'integer', default: 0 })
  sharesCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
