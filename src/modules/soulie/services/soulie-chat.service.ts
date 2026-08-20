import { Injectable } from '@nestjs/common';
import {
  SendSoulieMessageDto,
  SoulieChatListDto,
  SoulieChatMessageDto,
  SoulieChatThreadDetailDto,
} from '../dto/soulie.dto';
import { SoulieMessageType } from '../entities/message.entity';
import { ConversationService } from './conversation.service';
import { FriendService } from './friend.service';
import { formatShortAge, toFriendDto } from '../domain/soulie-utils';

@Injectable()
export class SoulieChatService {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly friendService: FriendService,
  ) {}

  async getChats(userId: number, query?: string): Promise<SoulieChatListDto> {
    const conversations = await this.conversationService.getConversations(
      userId,
      query,
    );

    return {
      chats: conversations.conversations.map((conversation) => ({
        friendId: conversation.friendId,
        name: conversation.friendName,
        avatarUrl: conversation.avatarUrl,
        lastMessage: conversation.lastMessage,
        time: formatShortAge(new Date(conversation.updatedAt)),
        isOnline: conversation.isOnline,
        unread: conversation.unreadCount,
        isPhoto: conversation.lastMessageType === SoulieMessageType.PHOTO,
      })),
      totalUnread: conversations.totalUnread,
    };
  }

  async getChatThread(
    userId: number,
    friendKey: string,
  ): Promise<SoulieChatThreadDetailDto> {
    const friend = await this.friendService.resolveAcceptedFriend(
      userId,
      friendKey,
    );
    const conversation = await this.conversationService.getDirectConversation(
      userId,
      friend.id,
    );

    if (!conversation) {
      return {
        friend: toFriendDto(friend),
        messages: [],
      };
    }

    const detail = await this.conversationService.getConversationMessages(
      userId,
      conversation.id,
    );
    return {
      friend: detail.friend,
      messages: detail.messages,
    };
  }

  async sendChatMessage(
    userId: number,
    friendKey: string,
    dto: SendSoulieMessageDto,
  ): Promise<SoulieChatMessageDto> {
    const friend = await this.friendService.resolveAcceptedFriend(
      userId,
      friendKey,
    );
    const conversation =
      await this.conversationService.getOrCreateDirectConversation(
        userId,
        friend.id,
      );

    return this.conversationService.sendConversationMessage(
      userId,
      conversation.id,
      dto,
    );
  }
}
