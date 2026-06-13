import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { RequestWithUser } from '../../common/types/auth.types';
import {
  CreateEducationSocialCommentDto,
  CreateEducationSocialPostDto,
  EducationSocialFeedQueryDto,
} from './dto/social.dto';
import { EducationSocialService } from './education-social.service';

@ApiTags('Education Social')
@Controller('social')
export class EducationSocialController {
  constructor(private readonly socialService: EducationSocialService) {}

  @Get('feed')
  getFeed(
    @Req() req: RequestWithUser,
    @Query() query: EducationSocialFeedQueryDto,
  ) {
    return this.socialService.getFeed(req.user!.sub, query);
  }

  @Post('posts')
  createPost(
    @Req() req: RequestWithUser,
    @Body() dto: CreateEducationSocialPostDto,
  ) {
    return this.socialService.createPost(req.user!.sub, dto);
  }

  @Post('posts/:postId/like')
  toggleLike(@Req() req: RequestWithUser, @Param('postId') postId: string) {
    return this.socialService.toggleLike(req.user!.sub, postId);
  }

  @Post('posts/:postId/bookmark')
  toggleBookmark(@Req() req: RequestWithUser, @Param('postId') postId: string) {
    return this.socialService.toggleBookmark(req.user!.sub, postId);
  }

  @Post('posts/:postId/comments')
  addComment(
    @Req() req: RequestWithUser,
    @Param('postId') postId: string,
    @Body() dto: CreateEducationSocialCommentDto,
  ) {
    return this.socialService.addComment(req.user!.sub, postId, dto);
  }

  @Get('trending')
  getTrending() {
    return this.socialService.getTrending();
  }
}
