import { Injectable } from '@nestjs/common';
import {
  CreateSoulieConversationDto,
  CreateSoulieFriendRequestDto,
  CreateSoulieMomentDto,
  SendSoulieMessageDto,
  SoulieCameraRecipientsDto,
  SoulieChatListDto,
  SoulieChatMessageDto,
  SoulieChatThreadDetailDto,
  SoulieConversationListDto,
  SoulieConversationMessagesDto,
  SoulieConversationSummaryDto,
  SoulieFriendRequestDto,
  SoulieFriendRequestsDto,
  SoulieFriendsResponseDto,
  SoulieHomeDto,
  SoulieJournalDto,
  SoulieMomentListDto,
  SoulieProfileDto,
  SoulieUserSuggestionDto,
  SoulieWidgetDto,
  UpdateSoulieProfileDto,
} from './dto/soulie.dto';
import { MomentBox } from './domain/soulie-utils';
import { FriendService } from './services/friend.service';
import { ProfileService } from './services/profile.service';
import { ConversationService } from './services/conversation.service';
import { MomentService } from './services/moment.service';
import { SoulieChatService } from './services/soulie-chat.service';
import { SoulieHomeService } from './services/soulie-home.service';

@Injectable()
export class SoulieService {
  constructor(
    private readonly friendService: FriendService,
    private readonly profileService: ProfileService,
    private readonly conversationService: ConversationService,
    private readonly momentService: MomentService,
    private readonly chatService: SoulieChatService,
    private readonly homeService: SoulieHomeService,
  ) {}

  async getHome(userId: number): Promise<SoulieHomeDto> {
    return this.homeService.getHome(userId);
  }

  async getWidget(userId: number): Promise<SoulieWidgetDto> {
    return this.homeService.getWidget(userId);
  }

  async getFriends(
    userId: number,
    query?: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<SoulieFriendsResponseDto> {
    return this.friendService.getFriends(userId, query, page, limit);
  }

  async discoverUsers(
    userId: number,
    query?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    users: SoulieUserSuggestionDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    return this.friendService.discoverUsers(userId, query, page, limit);
  }

  async getFriendRequests(userId: number): Promise<SoulieFriendRequestsDto> {
    return this.friendService.getFriendRequests(userId);
  }

  async createFriendRequest(
    userId: number,
    dto: CreateSoulieFriendRequestDto,
  ): Promise<SoulieFriendRequestDto> {
    return this.friendService.createFriendRequest(userId, dto);
  }

  async acceptFriendRequest(
    userId: number,
    requestId: string,
  ): Promise<SoulieFriendRequestDto> {
    return this.friendService.acceptFriendRequest(userId, requestId);
  }

  async rejectFriendRequest(
    userId: number,
    requestId: string,
  ): Promise<SoulieFriendRequestDto> {
    return this.friendService.rejectFriendRequest(userId, requestId);
  }

  async removeFriend(userId: number, friendKey: string) {
    return this.friendService.removeFriend(userId, friendKey);
  }

  async getConversations(
    userId: number,
    query?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<SoulieConversationListDto> {
    return this.conversationService.getConversations(
      userId,
      query,
      page,
      limit,
    );
  }

  async createDirectConversation(
    userId: number,
    dto: CreateSoulieConversationDto,
  ): Promise<SoulieConversationSummaryDto> {
    return this.conversationService.createDirectConversation(userId, dto);
  }

  async getConversationMessages(
    userId: number,
    conversationId: string,
  ): Promise<SoulieConversationMessagesDto> {
    return this.conversationService.getConversationMessages(
      userId,
      conversationId,
    );
  }

  async sendConversationMessage(
    userId: number,
    conversationId: string,
    dto: SendSoulieMessageDto,
  ): Promise<SoulieChatMessageDto> {
    return this.conversationService.sendConversationMessage(
      userId,
      conversationId,
      dto,
    );
  }

  async markConversationRead(userId: number, conversationId: string) {
    return this.conversationService.markConversationRead(
      userId,
      conversationId,
    );
  }

  async createMoment(userId: number, dto: CreateSoulieMomentDto) {
    return this.momentService.createMoment(userId, dto);
  }

  async getMoments(
    userId: number,
    box: MomentBox = 'received',
    page: number = 1,
    limit: number = 20,
  ): Promise<SoulieMomentListDto> {
    return this.momentService.getMoments(userId, box, page, limit);
  }

  async markMomentOpened(userId: number, momentId: string) {
    return this.momentService.markMomentOpened(userId, momentId);
  }

  async getJournal(userId: number): Promise<SoulieJournalDto> {
    return this.momentService.getJournal(userId);
  }

  async getProfile(userId: number): Promise<SoulieProfileDto> {
    return this.profileService.getProfile(userId);
  }

  async updateProfile(
    userId: number,
    dto: UpdateSoulieProfileDto,
  ): Promise<SoulieProfileDto> {
    return this.profileService.updateProfile(userId, dto);
  }

  async getCameraRecipients(
    userId: number,
  ): Promise<SoulieCameraRecipientsDto> {
    return this.homeService.getCameraRecipients(userId);
  }

  async getChats(userId: number, query?: string): Promise<SoulieChatListDto> {
    return this.chatService.getChats(userId, query);
  }

  async getChatThread(
    userId: number,
    friendKey: string,
  ): Promise<SoulieChatThreadDetailDto> {
    return this.chatService.getChatThread(userId, friendKey);
  }

  async sendChatMessage(
    userId: number,
    friendKey: string,
    dto: SendSoulieMessageDto,
  ): Promise<SoulieChatMessageDto> {
    return this.chatService.sendChatMessage(userId, friendKey, dto);
  }
}
