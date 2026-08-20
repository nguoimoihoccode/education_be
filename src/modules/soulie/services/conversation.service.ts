import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';
import {
  CreateSoulieConversationDto,
  SendSoulieMessageDto,
  SoulieChatMessageDto,
  SoulieConversationListDto,
  SoulieConversationMessagesDto,
  SoulieConversationSummaryDto,
} from '../dto/soulie.dto';
import { SoulieConversation } from '../entities/conversation.entity';
import { SoulieMessage, SoulieMessageType } from '../entities/message.entity';
import { FriendService } from './friend.service';
import {
  formatClock,
  getDisplayName,
  getPublicUsername,
  isUserOnline,
  toFriendDto,
} from '../domain/soulie-utils';

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(SoulieConversation)
    private readonly conversationRepository: Repository<SoulieConversation>,
    @InjectRepository(SoulieMessage)
    private readonly messageRepository: Repository<SoulieMessage>,
    private readonly friendService: FriendService,
    private readonly usersService: UsersService,
  ) {}

  async getConversations(
    userId: number,
    query?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<SoulieConversationListDto> {
    const normalizedQuery = (query ?? '').trim().toLowerCase();
    const conversations = await this.listConversationsForUser(userId);
    const unreadMap = await this.getUnreadCountMap(userId);
    const summaries = conversations
      .map((conversation) =>
        this.toConversationSummaryDto(conversation, userId, unreadMap),
      )
      .filter((conversation) =>
        normalizedQuery
          ? conversation.friendName.toLowerCase().includes(normalizedQuery) ||
            conversation.friendUsername.toLowerCase().includes(normalizedQuery)
          : true,
      );

    const total = summaries.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedConversations = summaries.slice(startIndex, endIndex);

    return {
      conversations: paginatedConversations,
      totalUnread: paginatedConversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0,
      ),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async createDirectConversation(
    userId: number,
    dto: CreateSoulieConversationDto,
  ): Promise<SoulieConversationSummaryDto> {
    const friend = await this.friendService.resolveAcceptedFriend(
      userId,
      dto.friendId,
    );
    const conversation = await this.getOrCreateDirectConversation(
      userId,
      friend.id,
    );
    const unreadMap = await this.getUnreadCountMap(userId);
    const hydrated = await this.getConversationForUser(userId, conversation.id);

    return this.toConversationSummaryDto(hydrated, userId, unreadMap);
  }

  async getConversationMessages(
    userId: number,
    conversationId: string,
  ): Promise<SoulieConversationMessagesDto> {
    const conversation = await this.getConversationForUser(
      userId,
      conversationId,
    );
    const friend = this.getFriendFromConversation(conversation, userId);
    const messages = await this.messageRepository.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    return {
      conversationId: conversation.id,
      friend: toFriendDto(friend),
      messages: messages.map((message) => this.toMessageDto(message, userId)),
    };
  }

  async sendConversationMessage(
    userId: number,
    conversationId: string,
    dto: SendSoulieMessageDto,
  ): Promise<SoulieChatMessageDto> {
    const conversation = await this.getConversationForUser(
      userId,
      conversationId,
    );
    const payload = this.normalizeMessagePayload(dto);
    const message = this.messageRepository.create({
      conversationId: conversation.id,
      senderId: userId,
      type: payload.type,
      text: payload.text,
      mediaUrl: payload.mediaUrl,
    });

    const savedMessage = await this.messageRepository.save(message);
    conversation.lastMessageAt = savedMessage.createdAt;
    conversation.lastMessageText =
      savedMessage.text ??
      (savedMessage.type === SoulieMessageType.PHOTO ? 'Sent a photo' : '');
    conversation.lastMessageType = savedMessage.type;
    await this.conversationRepository.save(conversation);
    await this.usersService.touchLastSeen(userId);

    return this.toMessageDto(savedMessage, userId);
  }

  async markConversationRead(userId: number, conversationId: string) {
    await this.getConversationForUser(userId, conversationId);

    await this.messageRepository
      .createQueryBuilder()
      .update(SoulieMessage)
      .set({ seenAt: new Date() })
      .where('conversation_id = :conversationId', { conversationId })
      .andWhere('sender_id != :userId', { userId })
      .andWhere('seen_at IS NULL')
      .execute();

    return { message: 'Conversation marked as read' };
  }

  async getDirectConversation(userId: number, friendId: number) {
    const [participantOneId, participantTwoId] = this.normalizeParticipants(
      userId,
      friendId,
    );

    return this.conversationRepository.findOne({
      where: { participantOneId, participantTwoId },
      relations: ['participantOne', 'participantTwo'],
    });
  }

  async getOrCreateDirectConversation(userId: number, friendId: number) {
    const existing = await this.getDirectConversation(userId, friendId);
    if (existing) {
      return existing;
    }

    const [participantOneId, participantTwoId] = this.normalizeParticipants(
      userId,
      friendId,
    );
    const conversation = this.conversationRepository.create({
      participantOneId,
      participantTwoId,
    });

    return this.conversationRepository.save(conversation);
  }

  private async listConversationsForUser(userId: number) {
    return this.conversationRepository.find({
      where: [{ participantOneId: userId }, { participantTwoId: userId }],
      relations: ['participantOne', 'participantTwo'],
      order: { lastMessageAt: 'DESC', updatedAt: 'DESC' },
    });
  }

  private async getUnreadCountMap(
    userId: number,
  ): Promise<Map<string, number>> {
    const rows = await this.messageRepository
      .createQueryBuilder('message')
      .select('message.conversationId', 'conversationId')
      .addSelect('COUNT(*)', 'count')
      .leftJoin('message.conversation', 'conversation')
      .where('message.seenAt IS NULL')
      .andWhere('message.senderId != :userId', { userId })
      .andWhere(
        '(conversation.participantOneId = :userId OR conversation.participantTwoId = :userId)',
        { userId },
      )
      .groupBy('message.conversationId')
      .getRawMany<{ conversationId: string; count: string }>();

    return new Map(
      rows.map((row) => [row.conversationId, Number.parseInt(row.count, 10)]),
    );
  }

  private toConversationSummaryDto(
    conversation: SoulieConversation,
    currentUserId: number,
    unreadMap: Map<string, number>,
  ): SoulieConversationSummaryDto {
    const friend = this.getFriendFromConversation(conversation, currentUserId);
    const updatedAt = conversation.lastMessageAt ?? conversation.updatedAt;

    return {
      conversationId: conversation.id,
      friendId: String(friend.id),
      friendName: getDisplayName(friend),
      friendUsername: getPublicUsername(friend),
      avatarUrl: friend.avatar ?? '',
      lastMessage: conversation.lastMessageText ?? '',
      lastMessageType: conversation.lastMessageType ?? SoulieMessageType.TEXT,
      updatedAt: updatedAt.toISOString(),
      unreadCount: unreadMap.get(conversation.id) ?? 0,
      isOnline: isUserOnline(friend),
    };
  }

  private getFriendFromConversation(
    conversation: SoulieConversation,
    currentUserId: number,
  ): User {
    return conversation.participantOneId === currentUserId
      ? conversation.participantTwo
      : conversation.participantOne;
  }

  private async getConversationForUser(
    userId: number,
    conversationId: string,
  ): Promise<SoulieConversation> {
    const conversation = await this.conversationRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.participantOne', 'participantOne')
      .leftJoinAndSelect('conversation.participantTwo', 'participantTwo')
      .where('conversation.id = :conversationId', { conversationId })
      .andWhere(
        '(conversation.participantOneId = :userId OR conversation.participantTwoId = :userId)',
        { userId },
      )
      .getOne();

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  private normalizeParticipants(firstUserId: number, secondUserId: number) {
    return firstUserId < secondUserId
      ? [firstUserId, secondUserId]
      : [secondUserId, firstUserId];
  }

  private normalizeMessagePayload(dto: SendSoulieMessageDto) {
    const text = dto.text?.trim() || null;
    const mediaUrl = dto.mediaUrl?.trim() || null;
    const type =
      dto.type ?? (mediaUrl ? SoulieMessageType.PHOTO : SoulieMessageType.TEXT);

    if (!text && !mediaUrl) {
      throw new BadRequestException('Message text or mediaUrl is required');
    }

    return { text, mediaUrl, type };
  }

  private toMessageDto(
    message: SoulieMessage,
    currentUserId: number,
  ): SoulieChatMessageDto {
    return {
      id: message.id,
      text:
        message.text ?? (message.type === SoulieMessageType.PHOTO ? '📸' : ''),
      isMe: message.senderId === currentUserId,
      time: formatClock(message.createdAt),
      type: message.type,
      mediaUrl: message.mediaUrl ?? undefined,
      seenAt: message.seenAt?.toISOString(),
    };
  }
}
