import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { UserStreak } from '../education/entities/user-streak.entity';
import { User } from '../users/entities/user.entity';
import { EducationSocialPostBookmark } from './entities/social-post-bookmark.entity';
import { EducationSocialPostLike } from './entities/social-post-like.entity';
import { EducationSocialComment } from './entities/social-comment.entity';
import { EducationSocialPost } from './entities/social-post.entity';
import { EducationSocialController } from './education-social.controller';
import { EducationSocialService } from './education-social.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EducationSocialPost,
      EducationSocialComment,
      EducationSocialPostLike,
      EducationSocialPostBookmark,
      User,
      UserStreak,
    ]),
    ActivityLogModule,
  ],
  controllers: [EducationSocialController],
  providers: [EducationSocialService],
  exports: [EducationSocialService],
})
export class EducationSocialModule {}
