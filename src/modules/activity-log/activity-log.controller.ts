import { Controller, Get, Query, Req } from '@nestjs/common';
import type { RequestWithUser } from '../../common/types/auth.types';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogQueryDto } from './dto/activity-log-query.dto';

@Controller('education/logs')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Get()
  list(@Req() req: RequestWithUser, @Query() query: ActivityLogQueryDto) {
    return this.activityLogService.list(req.user!.sub, query);
  }
}
