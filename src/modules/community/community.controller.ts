import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommunityService } from './community.service';

@ApiTags('Community')
@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Get('groups')
  @ApiOperation({ summary: 'Get study groups' })
  getGroups(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.communityService.getGroups({ page, limit });
  }

  @Post('groups/:groupId/join')
  @ApiOperation({ summary: 'Join a study group' })
  joinGroup(@Param('groupId') groupId: string) {
    return this.communityService.joinGroup(groupId);
  }

  @Delete('groups/:groupId/join')
  @ApiOperation({ summary: 'Leave a study group' })
  leaveGroup() {
    return this.communityService.leaveGroup();
  }

  @Get('events')
  @ApiOperation({ summary: 'Get community events' })
  getEvents(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.communityService.getEvents({ page, limit });
  }

  @Post('events/:eventId/register')
  @ApiOperation({ summary: 'Register for an event' })
  registerEvent(@Param('eventId') eventId: string) {
    return this.communityService.registerEvent(eventId);
  }

  @Delete('events/:eventId/register')
  @ApiOperation({ summary: 'Unregister from an event' })
  unregisterEvent() {
    return this.communityService.unregisterEvent();
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
