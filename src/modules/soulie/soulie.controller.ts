import {
  Controller,
  Get,
  Patch,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Query,
  Param,
  Post,
  Delete,
  HttpException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { SoulieService } from './soulie.service';
import { UpdateSoulieProfileDto } from './dto/soulie.dto';
import { CreateSoulieFriendRequestDto } from './dto/soulie.dto';
import { CreateSoulieMomentDto } from './dto/soulie.dto';
import { SendSoulieMessageDto } from './dto/soulie.dto';
import type { RequestWithUser } from '../../common/types/auth.types';
import { Pagination } from '../../common/decorators/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('soulie')
@ApiTags('Soulie - Social Platform')
export class SoulieController {
  constructor(private readonly soulieService: SoulieService) {}

  // Home & Dashboard

  @Get('home')
  @ApiOperation({ summary: 'Get home feed' })
  @ApiResponse({ status: 200, description: 'Home feed data' })
  async getHome(@Req() req: RequestWithUser) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.soulieService.getHome(userId);
  }

  @Get('widget')
  @ApiOperation({ summary: 'Get widget data' })
  @ApiResponse({ status: 200, description: 'Widget data' })
  async getWidget(@Req() req: any) {
    const userId = req.user?.sub;
    return this.soulieService.getWidget(userId);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get profile summary' })
  @ApiResponse({ status: 200, description: 'Profile data' })
  async getProfile(@Req() req: any) {
    const userId = req.user?.sub;
    return this.soulieService.getProfile(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @Req() req: any,
    @Body() updateProfileDto: UpdateSoulieProfileDto,
  ) {
    const userId = req.user?.sub;
    return this.soulieService.updateProfile(userId, updateProfileDto);
  }

  // Friends

  @Get('friends')
  @ApiOperation({ summary: 'Get friends list' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Friends list' })
  async getFriends(
    @Req() req: RequestWithUser,
    @Query('q') query?: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.soulieService.getFriends(
      userId,
      query,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Get('friends/discover')
  @ApiOperation({ summary: 'Discover users' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Users to discover' })
  async discoverUsers(
    @Req() req: RequestWithUser,
    @Query('q') query?: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.soulieService.discoverUsers(
      userId,
      query,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Get('friends/requests')
  @ApiOperation({ summary: 'Get friend requests' })
  @ApiResponse({ status: 200, description: 'Friend requests' })
  async getFriendRequests(@Req() req: any) {
    const userId = req.user?.sub;
    return this.soulieService.getFriendRequests(userId);
  }

  @Post('friends/requests')
  @ApiOperation({ summary: 'Create friend request' })
  @ApiResponse({ status: 201, description: 'Friend request created' })
  async createFriendRequest(
    @Req() req: any,
    @Body() createFriendRequestDto: CreateSoulieFriendRequestDto,
  ) {
    const userId = req.user?.sub;
    return this.soulieService.createFriendRequest(
      userId,
      createFriendRequestDto,
    );
  }

  @Post('friends/requests/:requestId/accept')
  @ApiOperation({ summary: 'Accept friend request' })
  @ApiParam({ name: 'requestId', description: 'Request ID' })
  @ApiResponse({ status: 200, description: 'Friend request accepted' })
  async acceptFriendRequest(
    @Req() req: any,
    @Param('requestId') requestId: string,
  ) {
    const userId = req.user?.sub;
    return this.soulieService.acceptFriendRequest(userId, requestId);
  }

  @Post('friends/requests/:requestId/reject')
  @ApiOperation({ summary: 'Reject friend request' })
  @ApiParam({ name: 'requestId', description: 'Request ID' })
  @ApiResponse({ status: 200, description: 'Friend request rejected' })
  async rejectFriendRequest(
    @Req() req: any,
    @Param('requestId') requestId: string,
  ) {
    const userId = req.user?.sub;
    return this.soulieService.rejectFriendRequest(userId, requestId);
  }

  @Delete('friends/:friendKey')
  @ApiOperation({ summary: 'Remove friend' })
  @ApiParam({ name: 'friendKey', description: 'Friend key' })
  @ApiResponse({ status: 200, description: 'Friend removed' })
  async removeFriend(@Req() req: any, @Param('friendKey') friendKey: string) {
    const userId = req.user?.sub;
    return this.soulieService.removeFriend(userId, friendKey);
  }

  // Moments

  @Get('moments')
  @ApiOperation({ summary: 'Get moments' })
  @ApiQuery({ name: 'box', required: false, description: 'sent or received' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of items' })
  @ApiResponse({ status: 200, description: 'Moments list' })
  async getMoments(
    @Req() req: RequestWithUser,
    @Query('box') box?: 'sent' | 'received',
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.soulieService.getMoments(
      userId,
      box,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Post('moments')
  @ApiOperation({ summary: 'Create moment' })
  @ApiResponse({ status: 201, description: 'Moment created' })
  async createMoment(
    @Req() req: any,
    @Body() createMomentDto: CreateSoulieMomentDto,
  ) {
    const userId = req.user?.sub;
    return this.soulieService.createMoment(userId, createMomentDto);
  }

  @Post('moments/:momentId/opened')
  @ApiOperation({ summary: 'Mark moment as opened' })
  @ApiParam({ name: 'momentId', description: 'Moment ID' })
  @ApiResponse({ status: 200, description: 'Moment marked as opened' })
  async markMomentOpened(@Req() req: any, @Param('momentId') momentId: string) {
    const userId = req.user?.sub;
    return this.soulieService.markMomentOpened(userId, momentId);
  }

  // Conversations & Messaging

  @Get('conversations')
  @ApiOperation({ summary: 'Get conversations' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Conversations list' })
  async getConversations(
    @Req() req: RequestWithUser,
    @Query('q') query?: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = req.user?.sub;
    if (!userId) {
      throw new HttpException(
        'User not authenticated',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.soulieService.getConversations(
      userId,
      query,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Post('conversations/direct')
  @ApiOperation({ summary: 'Create direct conversation' })
  @ApiResponse({ status: 201, description: 'Conversation created' })
  async createDirectConversation(
    @Req() req: any,
    @Body() body: { friendId: number },
  ) {
    const userId = req.user?.sub;
    return this.soulieService.createDirectConversation(userId, {
      friendId: String(body.friendId),
    });
  }

  @Get('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Get conversation messages' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Messages list' })
  async getConversationMessages(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
  ) {
    const userId = req.user?.sub;
    return this.soulieService.getConversationMessages(userId, conversationId);
  }

  @Post('conversations/:conversationId/messages')
  @ApiOperation({ summary: 'Send conversation message' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  async sendConversationMessage(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body() sendMessageDto: SendSoulieMessageDto,
  ) {
    const userId = req.user?.sub;
    return this.soulieService.sendConversationMessage(
      userId,
      conversationId,
      sendMessageDto,
    );
  }

  @Post('conversations/:conversationId/read')
  @ApiOperation({ summary: 'Mark conversation as read' })
  @ApiParam({ name: 'conversationId', description: 'Conversation ID' })
  @ApiResponse({ status: 200, description: 'Conversation marked as read' })
  async markConversationRead(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
  ) {
    const userId = req.user?.sub;
    return this.soulieService.markConversationRead(userId, conversationId);
  }

  // Journal

  @Get('journal')
  @ApiOperation({ summary: 'Get journal' })
  @ApiResponse({ status: 200, description: 'Journal data' })
  async getJournal(@Req() req: any) {
    const userId = req.user?.sub;
    return this.soulieService.getJournal(userId);
  }

  // Camera

  @Get('camera/recipients')
  @ApiOperation({ summary: 'Get camera recipients' })
  @ApiResponse({ status: 200, description: 'Camera recipients' })
  async getCameraRecipients(@Req() req: any) {
    const userId = req.user?.sub;
    return this.soulieService.getCameraRecipients(userId);
  }

  // Legacy Chat Endpoints

  @Get('chats')
  @ApiOperation({ summary: 'Get chats (legacy)' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Chats list' })
  async getChats(@Req() req: any, @Query('q') query?: string) {
    const userId = req.user?.sub;
    return this.soulieService.getChats(userId, query);
  }

  @Get('chats/:friendKey/messages')
  @ApiOperation({ summary: 'Get chat thread (legacy)' })
  @ApiParam({ name: 'friendKey', description: 'Friend key' })
  @ApiResponse({ status: 200, description: 'Chat messages' })
  async getChatThread(@Req() req: any, @Param('friendKey') friendKey: string) {
    const userId = req.user?.sub;
    return this.soulieService.getChatThread(userId, friendKey);
  }

  @Post('chats/:friendKey/messages')
  @ApiOperation({ summary: 'Send chat message (legacy)' })
  @ApiParam({ name: 'friendKey', description: 'Friend key' })
  @ApiResponse({ status: 201, description: 'Message sent' })
  async sendChatMessage(
    @Req() req: any,
    @Param('friendKey') friendKey: string,
    @Body() sendMessageDto: SendSoulieMessageDto,
  ) {
    const userId = req.user?.sub;
    return this.soulieService.sendChatMessage(
      userId,
      friendKey,
      sendMessageDto,
    );
  }
}
