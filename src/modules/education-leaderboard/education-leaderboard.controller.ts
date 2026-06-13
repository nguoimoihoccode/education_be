import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RequestWithUser } from '../../common/types/auth.types';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { EducationLeaderboardService } from './education-leaderboard.service';

@ApiTags('Education Leaderboard')
@Controller('education/leaderboard')
export class EducationLeaderboardController {
  constructor(
    private readonly leaderboardService: EducationLeaderboardService,
  ) {}

  @Get()
  list(@Req() req: RequestWithUser, @Query() query: LeaderboardQueryDto) {
    return this.leaderboardService.list(req.user!.sub, query);
  }

  @Get('stats')
  stats() {
    return this.leaderboardService.stats();
  }

  @Get('me')
  me(@Req() req: RequestWithUser) {
    return this.leaderboardService.me(req.user!.sub);
  }
}
