import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { EducationSocialPost } from './social-post.entity';

@Entity('edu_social_post_likes')
@Unique('UQ_edu_social_post_likes_post_user', ['postId', 'userId'])
export class EducationSocialPostLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => EducationSocialPost, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: EducationSocialPost;

  @Column({ name: 'user_id', type: 'integer' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
