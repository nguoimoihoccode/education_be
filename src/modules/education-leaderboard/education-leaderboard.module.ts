import { Module } from '@nestjs/common';
import { CacheModule } from '../../common/cache/cache.module';
import { EducationLeaderboardController } from './education-leaderboard.controller';
import {
  EDUCATION_LEADERBOARD_CLOCK,
  EducationLeaderboardService,
} from './education-leaderboard.service';

@Module({
  imports: [CacheModule],
  controllers: [EducationLeaderboardController],
  providers: [
    EducationLeaderboardService,
    {
      provide: EDUCATION_LEADERBOARD_CLOCK,
      useValue: () => new Date(),
    },
  ],
  exports: [EducationLeaderboardService],
})
export class EducationLeaderboardModule {}
