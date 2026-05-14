import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { RequestWithUser } from '../../common/types/auth.types';
import { CommunityService } from './community.service';

@ApiTags('Community')
@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  private getUserId(req: RequestWithUser): number {
    const userId = req.user?.sub ?? req.user?.id;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return userId;
  }

  @Get('groups')
  @ApiOperation({ summary: 'Get study groups' })
  getGroups(
    @Req() req: RequestWithUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.communityService.getGroups({
      page,
      limit,
      userId: this.getUserId(req),
    });
  }

  @Post('groups/:groupId/join')
  @ApiOperation({ summary: 'Join a study group' })
  joinGroup(@Req() req: RequestWithUser, @Param('groupId') groupId: string) {
    return this.communityService.joinGroup(this.getUserId(req), groupId);
  }

  @Delete('groups/:groupId/join')
  @ApiOperation({ summary: 'Leave a study group' })
  leaveGroup(@Req() req: RequestWithUser, @Param('groupId') groupId: string) {
    return this.communityService.leaveGroup(this.getUserId(req), groupId);
  }

  @Get('events')
  @ApiOperation({ summary: 'Get community events' })
  getEvents(
    @Req() req: RequestWithUser,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.communityService.getEvents({
      page,
      limit,
      userId: this.getUserId(req),
    });
  }

  @Post('events/:eventId/register')
  @ApiOperation({ summary: 'Register for an event' })
  registerEvent(
    @Req() req: RequestWithUser,
    @Param('eventId') eventId: string,
  ) {
    return this.communityService.registerEvent(this.getUserId(req), eventId);
  }

  @Delete('events/:eventId/register')
  @ApiOperation({ summary: 'Unregister from an event' })
  unregisterEvent(
    @Req() req: RequestWithUser,
    @Param('eventId') eventId: string,
  ) {
    return this.communityService.unregisterEvent(this.getUserId(req), eventId);
  }

  @Get('forum/threads')
  @ApiOperation({ summary: 'Get forum threads' })
  getThreads(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.communityService.getThreads({ page, limit });
  }

  @Get('resources')
  @ApiOperation({ summary: 'Get shared resources' })
  getResources(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.communityService.getResources({ page, limit });
  }

  @Get('top-members')
  @ApiOperation({ summary: 'Get top community members' })
  getTopMembers(@Query('limit') limit?: number) {
    return this.communityService.getTopMembers(Number(limit) || 10);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get community statistics' })
  getStats() {
    return this.communityService.getStats();
  }
}
