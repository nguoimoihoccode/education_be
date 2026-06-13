import type { DynamicModule, Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ActivityLogModule } from '../activity-log/activity-log.module';
import { UserStreak } from '../education/entities/user-streak.entity';
import { User } from '../users/entities/user.entity';
import { EducationSocialController } from './education-social.controller';
import { EducationSocialModule } from './education-social.module';
import { EducationSocialService } from './education-social.service';
import { EducationSocialPostBookmark } from './entities/social-post-bookmark.entity';
import { EducationSocialPostLike } from './entities/social-post-like.entity';
import { EducationSocialComment } from './entities/social-comment.entity';
import { EducationSocialPost } from './entities/social-post.entity';

describe('EducationSocialModule', () => {
  it('registers repositories, activity logging, controller, and service export', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, EducationSocialModule) ?? [];
    const typeOrmFeature = imports[0] as DynamicModule;
    const providerTokens = (typeOrmFeature.providers ?? []).map(
      (provider: Provider) =>
        typeof provider === 'object' && 'provide' in provider
          ? provider.provide
          : provider,
    );

    for (const entity of [
      EducationSocialPost,
      EducationSocialComment,
      EducationSocialPostLike,
      EducationSocialPostBookmark,
      User,
      UserStreak,
    ]) {
      expect(providerTokens).toContain(getRepositoryToken(entity));
    }
    expect(imports).toContain(ActivityLogModule);
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, EducationSocialModule),
    ).toContain(EducationSocialController);
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, EducationSocialModule),
    ).toContain(EducationSocialService);
    expect(
      Reflect.getMetadata(MODULE_METADATA.EXPORTS, EducationSocialModule),
    ).toContain(EducationSocialService);
  });
});
