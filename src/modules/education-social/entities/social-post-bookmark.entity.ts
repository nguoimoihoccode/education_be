import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { EducationSocialPost } from './social-post.entity';

@Entity('edu_social_post_bookmarks')
@Unique('UQ_edu_social_post_bookmarks_post_user', ['postId', 'userId'])
@Index('IDX_edu_social_post_bookmarks_user', ['userId'])
export class EducationSocialPostBookmark {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => EducationSocialPost, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'post_id',
    foreignKeyConstraintName: 'FK_edu_social_post_bookmarks_post',
  })
  post: EducationSocialPost;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_edu_social_post_bookmarks_user',
  })
  user: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
