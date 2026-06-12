import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { EducationSocialPost } from './social-post.entity';

@Entity('edu_social_comments')
@Index('IDX_edu_social_comments_post_created', ['postId', 'createdAt'])
@Index('IDX_edu_social_comments_author', ['authorId'])
export class EducationSocialComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => EducationSocialPost, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'post_id',
    foreignKeyConstraintName: 'FK_edu_social_comments_post',
  })
  post: EducationSocialPost;

  @Column({ name: 'author_id', type: 'integer' })
  authorId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'author_id',
    foreignKeyConstraintName: 'FK_edu_social_comments_author',
  })
  author: User;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'likes_count', type: 'integer', default: 0 })
  likesCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
