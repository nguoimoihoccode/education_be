import { MODULE_METADATA } from '@nestjs/common/constants';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { DynamicModule, Provider } from '@nestjs/common';
import { QuizSession } from '../education/entities/quiz-session.entity';
import { ReviewSession } from '../education/entities/review-session.entity';
import { UserLesson } from '../education/entities/user-lesson.entity';
import { ActivityLogModule } from './activity-log.module';
import { EducationActivityLog } from './entities/activity-log.entity';

describe('ActivityLogModule', () => {
  it('registers only the repository injected by ActivityLogService', () => {
    const imports =
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, ActivityLogModule) ?? [];
    const typeOrmFeature = imports[0] as DynamicModule;
    const providerTokens = (typeOrmFeature.providers ?? []).map(
      (provider: Provider) =>
        typeof provider === 'object' && 'provide' in provider
          ? provider.provide
          : provider,
    );

    expect(providerTokens).toContain(getRepositoryToken(EducationActivityLog));
    expect(providerTokens).not.toContain(getRepositoryToken(UserLesson));
    expect(providerTokens).not.toContain(getRepositoryToken(QuizSession));
    expect(providerTokens).not.toContain(getRepositoryToken(ReviewSession));
  });
});
