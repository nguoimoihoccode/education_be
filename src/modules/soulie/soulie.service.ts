import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import {
  CreateSoulieConversationDto,
  CreateSoulieFriendRequestDto,
  CreateSoulieMomentDto,
  SendSoulieMessageDto,
  SoulieCameraRecipientDto,
  SoulieCameraRecipientsDto,
  SoulieChatListDto,
  SoulieChatMessageDto,
  SoulieChatThreadDetailDto,
  SoulieChatThreadDto,
  SoulieConversationListDto,
  SoulieConversationMessagesDto,
  SoulieConversationSummaryDto,
  SoulieFriendActivityDto,
  SoulieFriendDto,
  SoulieFriendGridItemDto,
  SoulieFriendRequestDto,
  SoulieFriendRequestsDto,
  SoulieFriendsResponseDto,
  SoulieHomeDto,
  SoulieJournalDto,
  SoulieJournalEntryDto,
  SoulieMomentListDto,
  SoulieProfileDto,
  SoulieUserSuggestionDto,
  SoulieWidgetDto,
  UpdateSoulieProfileDto,
} from './dto/soulie.dto';
import {
  SoulieFriendship,
  SoulieFriendshipStatus,
} from './entities/friendship.entity';
import { SoulieConversation } from './entities/conversation.entity';
import { SoulieMessage, SoulieMessageType } from './entities/message.entity';
import { SoulieMoment } from './entities/moment.entity';

type MomentBox = 'sent' | 'received';
type DiscoverRelation =
  | 'none'
  | 'incoming_request'
  | 'outgoing_request'
  | 'friend';

@Injectable()
export class SoulieService {
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SoulieFriendship)
    private readonly friendshipRepository: Repository<SoulieFriendship>,
    @InjectRepository(SoulieConversation)
    private readonly conversationRepository: Repository<SoulieConversation>,
    @InjectRepository(SoulieMessage)
    private readonly messageRepository: Repository<SoulieMessage>,
    @InjectRepository(SoulieMoment)
    private readonly momentRepository: Repository<SoulieMoment>,
  ) {}

  async getHome(userId: number): Promise<SoulieHomeDto> {
    const [friends, recentMoments, notificationCount] = await Promise.all([
      this.getAcceptedFriendUsers(userId),
      this.momentRepository.find({
        where: { recipientId: userId },
        relations: ['sender'],
        order: { createdAt: 'DESC' },
        take: 4,
      }),
      this.getNotificationCount(userId),
    ]);

    return {
      recentlyShared: recentMoments.map((moment) =>
        this.toFriendActivityDto(moment.sender, moment),
      ),
      friendsGrid: friends
        .slice(0, 6)
        .map((friend) => this.toFriendGridItemDto(friend)),
      liveFeedMessage:
        recentMoments[0]?.caption?.trim() ||
        (friends.length > 0
          ? `${this.getDisplayName(friends[0])} shared a moment with you`
          : 'Your Soulie feed is quiet right now'),
      notificationCount,
    };
  }

  async getWidget(userId: number): Promise<SoulieWidgetDto> {
    const home = await this.getHome(userId);
    const latestMoment = await this.momentRepository.findOne({
      where: { recipientId: userId },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
    });

    return {
      title: latestMoment ? 'Soulie' : 'Your Soulie widget',
      subtitle: latestMoment
        ? `${this.getDisplayName(latestMoment.sender)} shared a moment`
        : 'Your close-friends camera is waiting.',
      highlight: home.liveFeedMessage,
      friends: home.friendsGrid.map((friend) => friend.name).slice(0, 3),
      notificationCount: home.notificationCount,
      latestMomentImageUrl: latestMoment?.imageUrl ?? undefined,
      latestMomentThumbnailUrl: latestMoment?.thumbnailUrl ?? undefined,
      latestMomentWidth: latestMoment?.imageWidth ?? undefined,
      latestMomentHeight: latestMoment?.imageHeight ?? undefined,
    };
  }

  async getFriends(
    userId: number,
    query?: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<SoulieFriendsResponseDto> {
    const normalizedQuery = (query ?? '').trim().toLowerCase();
    const friends = await this.getAcceptedFriendUsers(userId);
    const result = friends
      .map((friend) => this.toFriendDto(friend))
      .filter((friend) =>
        normalizedQuery
          ? friend.name.toLowerCase().includes(normalizedQuery) ||
            friend.username.toLowerCase().includes(normalizedQuery)
          : true,
      );

    const total = result.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedFriends = result.slice(startIndex, endIndex);

    return {
      friends: paginatedFriends,
      total,
      query: normalizedQuery,
      page,
      limit,
      totalPages,
    };
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
    const normalizedQuery = (query ?? '').trim().toLowerCase();
    const candidates = await this.userRepository.find({
      order: { lastSeenAt: 'DESC', createdAt: 'DESC' },
    });
    const relationMap = await this.buildUserRelationMap(userId);

    const filtered = candidates
      .filter((candidate) => candidate.id !== userId)
      .map((candidate) => this.toUserSuggestionDto(candidate, relationMap))
      .filter((candidate) =>
        normalizedQuery
          ? candidate.name.toLowerCase().includes(normalizedQuery) ||
            candidate.username.toLowerCase().includes(normalizedQuery)
          : true,
      );

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUsers = filtered.slice(startIndex, endIndex);

    return {
      users: paginatedUsers,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getFriendRequests(userId: number): Promise<SoulieFriendRequestsDto> {
    const [incoming, outgoing] = await Promise.all([
      this.friendshipRepository.find({
        where: {
          addresseeId: userId,
          status: SoulieFriendshipStatus.PENDING,
        },
        relations: ['requester'],
        order: { createdAt: 'DESC' },
      }),
      this.friendshipRepository.find({
        where: {
          requesterId: userId,
          status: SoulieFriendshipStatus.PENDING,
        },
        relations: ['addressee'],
        order: { createdAt: 'DESC' },
      }),
    ]);

    return {
      incoming: incoming.map((request) =>
        this.toFriendRequestDto(request, 'incoming'),
      ),
      outgoing: outgoing.map((request) =>
        this.toFriendRequestDto(request, 'outgoing'),
      ),
    };
  }

  async createFriendRequest(
    userId: number,
    dto: CreateSoulieFriendRequestDto,
  ): Promise<SoulieFriendRequestDto> {
    const target = await this.resolveRequestTarget(userId, dto);
    const existing = await this.findFriendshipBetween(userId, target.id);

    if (existing?.status === SoulieFriendshipStatus.ACCEPTED) {
      throw new ConflictException('You are already friends');
    }

    if (existing?.status === SoulieFriendshipStatus.BLOCKED) {
      throw new ConflictException('This friendship is blocked');
    }

    if (
      existing?.status === SoulieFriendshipStatus.PENDING &&
      existing.addresseeId === userId
    ) {
      existing.status = SoulieFriendshipStatus.ACCEPTED;
      existing.respondedAt = new Date();
      const saved = await this.friendshipRepository.save(existing);
      return this.toFriendRequestDto(saved, 'incoming');
    }

    if (existing?.status === SoulieFriendshipStatus.PENDING) {
      throw new ConflictException('Friend request already sent');
    }

    const request = this.friendshipRepository.create({
      requesterId: userId,
      addresseeId: target.id,
      status: SoulieFriendshipStatus.PENDING,
    });
    const saved = await this.friendshipRepository.save(request);
    const populated = await this.friendshipRepository.findOne({
      where: { id: saved.id },
      relations: ['addressee'],
    });

    if (!populated) {
      throw new NotFoundException('Friend request could not be loaded');
    }

    return this.toFriendRequestDto(populated, 'outgoing');
  }

  async acceptFriendRequest(
    userId: number,
    requestId: string,
  ): Promise<SoulieFriendRequestDto> {
    const request = await this.friendshipRepository.findOne({
      where: {
        id: requestId,
        addresseeId: userId,
        status: SoulieFriendshipStatus.PENDING,
      },
      relations: ['requester'],
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    request.status = SoulieFriendshipStatus.ACCEPTED;
    request.respondedAt = new Date();

    const saved = await this.friendshipRepository.save(request);
    return this.toFriendRequestDto(saved, 'incoming');
  }

  async rejectFriendRequest(
    userId: number,
    requestId: string,
  ): Promise<SoulieFriendRequestDto> {
    const request = await this.friendshipRepository.findOne({
      where: {
        id: requestId,
        addresseeId: userId,
        status: SoulieFriendshipStatus.PENDING,
      },
      relations: ['requester'],
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    request.status = SoulieFriendshipStatus.REJECTED;
    request.respondedAt = new Date();

    const saved = await this.friendshipRepository.save(request);
    return this.toFriendRequestDto(saved, 'incoming');
  }

  async removeFriend(userId: number, friendKey: string) {
    const friend = await this.resolveAcceptedFriend(userId, friendKey);
    const friendship = await this.findAcceptedFriendship(userId, friend.id);

    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    await this.friendshipRepository.remove(friendship);

    return { message: 'Friend removed successfully' };
  }

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
    const friend = await this.resolveAcceptedFriend(userId, dto.friendId);
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
      friend: this.toFriendDto(friend),
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

  async createMoment(userId: number, dto: CreateSoulieMomentDto) {
    const recipientIds = await this.resolveMomentRecipientIds(
      userId,
      dto.recipientIds,
    );
    const recipients = await this.userRepository.find({
      where: { id: In(recipientIds) },
    });
    const recipientMap = new Map(
      recipients.map((recipient) => [
        recipient.id,
        this.getDisplayName(recipient),
      ]),
    );
    const moments = recipientIds.map((recipientId) =>
      this.momentRepository.create({
        senderId: userId,
        recipientId,
        caption: dto.caption?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
      }),
    );

    const saved = await this.momentRepository.save(moments);
    await this.usersService.touchLastSeen(userId);

    return {
      count: saved.length,
      items: saved.map((moment) =>
        this.toJournalEntryDtoFromMoment(
          moment,
          String(moment.recipientId),
          recipientMap.get(moment.recipientId) ?? String(moment.recipientId),
        ),
      ),
    };
  }

  async getMoments(
    userId: number,
    box: MomentBox = 'received',
    page: number = 1,
    limit: number = 20,
  ): Promise<SoulieMomentListDto> {
    const skip = (page - 1) * limit;

    const moments =
      box === 'sent'
        ? await this.momentRepository.find({
            where: { senderId: userId },
            relations: ['recipient'],
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
          })
        : await this.momentRepository.find({
            where: { recipientId: userId },
            relations: ['sender'],
            order: { createdAt: 'DESC' },
            skip,
            take: limit,
          });

    const total = await this.momentRepository.count({
      where: box === 'sent' ? { senderId: userId } : { recipientId: userId },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      box,
      total,
      page,
      limit,
      totalPages,
      items: moments.map((moment) =>
        box === 'sent'
          ? this.toJournalEntryDtoFromMoment(
              moment,
              String(moment.recipientId),
              this.getDisplayName(moment.recipient),
            )
          : this.toJournalEntryDtoFromMoment(
              moment,
              String(moment.senderId),
              this.getDisplayName(moment.sender),
            ),
      ),
    };
  }

  async markMomentOpened(userId: number, momentId: string) {
    const moment = await this.momentRepository.findOne({
      where: { id: momentId, recipientId: userId },
    });

    if (!moment) {
      throw new NotFoundException('Moment not found');
    }

    if (!moment.openedAt) {
      moment.openedAt = new Date();
      await this.momentRepository.save(moment);
    }

    return { message: 'Moment marked as opened' };
  }

  async getJournal(userId: number): Promise<SoulieJournalDto> {
    const [sent, received, stats] = await Promise.all([
      this.getMoments(userId, 'sent', 20),
      this.getMoments(userId, 'received', 20),
      this.getProfileStats(userId),
    ]);

    return {
      totalSent: stats.totalSent,
      totalReceived: stats.totalReceived,
      totalFriends: stats.friendCount,
      streakDays: stats.streakDays,
      sentEntries: sent.items,
      receivedEntries: received.items,
    };
  }

  async getProfile(userId: number): Promise<SoulieProfileDto> {
    const user = await this.findUserOrThrow(userId);
    const stats = await this.getProfileStats(userId);

    return {
      id: String(user.id),
      email: user.email,
      displayName: this.getDisplayName(user),
      username: this.getPublicUsername(user),
      avatarUrl: user.avatar ?? '',
      totalSent: stats.totalSent,
      totalReceived: stats.totalReceived,
      friendCount: stats.friendCount,
      streakDays: stats.streakDays,
    };
  }

  async updateProfile(
    userId: number,
    dto: UpdateSoulieProfileDto,
  ): Promise<SoulieProfileDto> {
    const normalizedUsername =
      dto.username?.trim().replace(/^@/, '').toLowerCase() ?? undefined;

    if (normalizedUsername) {
      const usernameTaken = await this.usersService.isUsernameTaken(
        normalizedUsername,
        userId,
      );
      if (usernameTaken) {
        throw new ConflictException('Username is already taken');
      }
    }

    await this.usersService.updateProfile(userId, {
      name: dto.displayName?.trim(),
      username: normalizedUsername,
      avatar: dto.avatarUrl?.trim(),
    });

    return this.getProfile(userId);
  }

  async getCameraRecipients(
    userId: number,
  ): Promise<SoulieCameraRecipientsDto> {
    const friends = await this.getAcceptedFriendUsers(userId);
    const recipients: SoulieCameraRecipientDto[] = [
      {
        id: 'all-friends',
        name: 'All Friends',
        avatarUrl: '',
        isGroup: true,
        isOnline: friends.some((friend) => this.isUserOnline(friend)),
      },
      ...friends.map((friend) => ({
        id: String(friend.id),
        name: this.getDisplayName(friend),
        avatarUrl: friend.avatar ?? '',
        isGroup: false,
        isOnline: this.isUserOnline(friend),
      })),
    ];

    return { recipients };
  }

  async getChats(userId: number, query?: string): Promise<SoulieChatListDto> {
    const conversations = await this.getConversations(userId, query);

    return {
      chats: conversations.conversations.map((conversation) => ({
        friendId: conversation.friendId,
        name: conversation.friendName,
        avatarUrl: conversation.avatarUrl,
        lastMessage: conversation.lastMessage,
        time: this.formatShortAge(new Date(conversation.updatedAt)),
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
    const friend = await this.resolveAcceptedFriend(userId, friendKey);
    const conversation = await this.getDirectConversation(userId, friend.id);

    if (!conversation) {
      return {
        friend: this.toFriendDto(friend),
        messages: [],
      };
    }

    const detail = await this.getConversationMessages(userId, conversation.id);
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
    const friend = await this.resolveAcceptedFriend(userId, friendKey);
    const conversation = await this.getOrCreateDirectConversation(
      userId,
      friend.id,
    );

    return this.sendConversationMessage(userId, conversation.id, dto);
  }

  private async getNotificationCount(userId: number): Promise<number> {
    const [pendingRequests, unopenedMoments, unreadMessages] =
      await Promise.all([
        this.friendshipRepository.count({
          where: {
            addresseeId: userId,
            status: SoulieFriendshipStatus.PENDING,
          },
        }),
        this.momentRepository.count({
          where: {
            recipientId: userId,
            openedAt: IsNull(),
          },
        }),
        this.messageRepository
          .createQueryBuilder('message')
          .leftJoin('message.conversation', 'conversation')
          .where('message.seenAt IS NULL')
          .andWhere('message.senderId != :userId', { userId })
          .andWhere(
            '(conversation.participantOneId = :userId OR conversation.participantTwoId = :userId)',
            { userId },
          )
          .getCount(),
      ]);

    return pendingRequests + unopenedMoments + unreadMessages;
  }

  private async getAcceptedFriendUsers(userId: number): Promise<User[]> {
    const friendships = await this.friendshipRepository.find({
      where: [
        { requesterId: userId, status: SoulieFriendshipStatus.ACCEPTED },
        { addresseeId: userId, status: SoulieFriendshipStatus.ACCEPTED },
      ],
      relations: ['requester', 'addressee'],
      order: { updatedAt: 'DESC' },
    });

    return friendships.map((friendship) =>
      friendship.requesterId === userId
        ? friendship.addressee
        : friendship.requester,
    );
  }

  private async buildUserRelationMap(
    userId: number,
  ): Promise<Map<number, DiscoverRelation>> {
    const friendships = await this.friendshipRepository.find({
      where: [{ requesterId: userId }, { addresseeId: userId }],
    });
    const relationMap = new Map<number, DiscoverRelation>();

    for (const friendship of friendships) {
      const otherUserId =
        friendship.requesterId === userId
          ? friendship.addresseeId
          : friendship.requesterId;

      if (friendship.status === SoulieFriendshipStatus.ACCEPTED) {
        relationMap.set(otherUserId, 'friend');
        continue;
      }

      if (friendship.status === SoulieFriendshipStatus.PENDING) {
        relationMap.set(
          otherUserId,
          friendship.requesterId === userId
            ? 'outgoing_request'
            : 'incoming_request',
        );
      }
    }

    return relationMap;
  }

  private async resolveRequestTarget(
    userId: number,
    dto: CreateSoulieFriendRequestDto,
  ): Promise<User> {
    if (!dto.targetUserId && !dto.email) {
      throw new BadRequestException('targetUserId or email is required');
    }

    let target: User | null = null;

    if (dto.targetUserId) {
      const parsedId = this.parseUserId(dto.targetUserId);
      target = await this.userRepository.findOne({ where: { id: parsedId } });
    } else if (dto.email) {
      target = await this.userRepository.findOne({
        where: { email: dto.email },
      });
    }

    if (!target) {
      throw new NotFoundException('Target user not found');
    }

    if (target.id === userId) {
      throw new BadRequestException('You cannot friend yourself');
    }

    return target;
  }

  private async findFriendshipBetween(userAId: number, userBId: number) {
    return this.friendshipRepository.findOne({
      where: [
        { requesterId: userAId, addresseeId: userBId },
        { requesterId: userBId, addresseeId: userAId },
      ],
      relations: ['requester', 'addressee'],
    });
  }

  private async findAcceptedFriendship(userAId: number, userBId: number) {
    return this.friendshipRepository.findOne({
      where: [
        {
          requesterId: userAId,
          addresseeId: userBId,
          status: SoulieFriendshipStatus.ACCEPTED,
        },
        {
          requesterId: userBId,
          addresseeId: userAId,
          status: SoulieFriendshipStatus.ACCEPTED,
        },
      ],
      relations: ['requester', 'addressee'],
    });
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
      friendName: this.getDisplayName(friend),
      friendUsername: this.getPublicUsername(friend),
      avatarUrl: friend.avatar ?? '',
      lastMessage: conversation.lastMessageText ?? '',
      lastMessageType: conversation.lastMessageType ?? SoulieMessageType.TEXT,
      updatedAt: updatedAt.toISOString(),
      unreadCount: unreadMap.get(conversation.id) ?? 0,
      isOnline: this.isUserOnline(friend),
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

  private async getDirectConversation(userId: number, friendId: number) {
    const [participantOneId, participantTwoId] = this.normalizeParticipants(
      userId,
      friendId,
    );

    return this.conversationRepository.findOne({
      where: { participantOneId, participantTwoId },
      relations: ['participantOne', 'participantTwo'],
    });
  }

  private async getOrCreateDirectConversation(
    userId: number,
    friendId: number,
  ) {
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
      time: this.formatClock(message.createdAt),
      type: message.type,
      mediaUrl: message.mediaUrl ?? undefined,
      seenAt: message.seenAt?.toISOString(),
    };
  }

  private async resolveMomentRecipientIds(
    userId: number,
    rawRecipientIds: string[],
  ): Promise<number[]> {
    if (rawRecipientIds.includes('all-friends')) {
      const friends = await this.getAcceptedFriendUsers(userId);
      if (friends.length === 0) {
        throw new BadRequestException('You do not have any friends to send to');
      }
      return friends.map((friend) => friend.id);
    }

    const recipientIds = rawRecipientIds.map((recipientId) =>
      this.parseUserId(recipientId),
    );
    const friends = await this.getAcceptedFriendUsers(userId);
    const allowedIds = new Set(friends.map((friend) => friend.id));

    for (const recipientId of recipientIds) {
      if (!allowedIds.has(recipientId)) {
        throw new BadRequestException(
          `Recipient ${recipientId} is not in your friends list`,
        );
      }
    }

    return Array.from(new Set(recipientIds));
  }

  private toJournalEntryDtoFromMoment(
    moment: SoulieMoment,
    friendId: string,
    friendName: string,
  ): SoulieJournalEntryDto {
    return {
      id: moment.id,
      timeLabel: this.formatJournalLabel(moment.createdAt),
      friendId,
      friendName,
      caption: moment.caption ?? undefined,
      imageUrl: moment.imageUrl ?? undefined,
      thumbnailUrl: moment.thumbnailUrl ?? undefined,
      imageWidth: moment.imageWidth ?? undefined,
      imageHeight: moment.imageHeight ?? undefined,
      createdAt: moment.createdAt.toISOString(),
    };
  }

  private async getProfileStats(userId: number) {
    const [totalSent, totalReceived, friendCount, sentMoments] =
      await Promise.all([
        this.momentRepository.count({ where: { senderId: userId } }),
        this.momentRepository.count({ where: { recipientId: userId } }),
        this.friendshipRepository.count({
          where: [
            { requesterId: userId, status: SoulieFriendshipStatus.ACCEPTED },
            { addresseeId: userId, status: SoulieFriendshipStatus.ACCEPTED },
          ],
        }),
        this.momentRepository.find({
          where: { senderId: userId },
          select: { createdAt: true, id: true },
          order: { createdAt: 'DESC' },
          take: 365,
        }),
      ]);

    return {
      totalSent,
      totalReceived,
      friendCount,
      streakDays: this.calculateStreak(
        sentMoments.map((moment) => moment.createdAt),
      ),
    };
  }

  private calculateStreak(dates: Date[]): number {
    if (dates.length === 0) {
      return 0;
    }

    const dateSet = new Set(
      dates.map((date) => date.toISOString().slice(0, 10)),
    );
    let streak = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);

    while (dateSet.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return streak;
  }

  private async resolveAcceptedFriend(userId: number, friendKey: string) {
    const friends = await this.getAcceptedFriendUsers(userId);
    const normalizedKey = friendKey.trim().toLowerCase();

    const match = friends.find((friend) => {
      const name = this.getDisplayName(friend).toLowerCase();
      const slug = name.replace(/\s+/g, '-');
      const username = this.getPublicUsername(friend)
        .replace('@', '')
        .toLowerCase();

      return (
        String(friend.id) === normalizedKey ||
        name === normalizedKey ||
        slug === normalizedKey ||
        username === normalizedKey
      );
    });

    if (!match) {
      throw new NotFoundException('Friend not found');
    }

    return match;
  }

  private toFriendActivityDto(
    sender: User,
    moment: SoulieMoment,
  ): SoulieFriendActivityDto {
    return {
      id: String(sender.id),
      name: this.getDisplayName(sender),
      avatarUrl: sender.avatar ?? '',
      timeAgo: this.formatTimeAgo(moment.createdAt),
      imageUrl: moment.imageUrl ?? undefined,
      thumbnailUrl: moment.thumbnailUrl ?? undefined,
      imageWidth: moment.imageWidth ?? undefined,
      imageHeight: moment.imageHeight ?? undefined,
    };
  }

  private toFriendGridItemDto(user: User): SoulieFriendGridItemDto {
    return {
      id: String(user.id),
      name: this.getDisplayName(user),
      avatarUrl: user.avatar ?? '',
      isOnline: this.isUserOnline(user),
    };
  }

  private toFriendDto(user: User): SoulieFriendDto {
    return {
      id: String(user.id),
      name: this.getDisplayName(user),
      username: this.getPublicUsername(user),
      status: this.isUserOnline(user)
        ? 'Active now'
        : user.lastSeenAt
          ? `Active ${this.formatTimeAgo(user.lastSeenAt)}`
          : 'Offline',
      isOnline: this.isUserOnline(user),
      avatarUrl: user.avatar ?? '',
    };
  }

  private toFriendRequestDto(
    friendship: SoulieFriendship,
    direction: 'incoming' | 'outgoing',
  ): SoulieFriendRequestDto {
    const user =
      direction === 'incoming' ? friendship.requester : friendship.addressee;

    return {
      id: friendship.id,
      direction,
      status: friendship.status,
      createdAt: friendship.createdAt.toISOString(),
      user: this.toFriendDto(user),
    };
  }

  private toUserSuggestionDto(
    user: User,
    relationMap: Map<number, DiscoverRelation>,
  ): SoulieUserSuggestionDto {
    return {
      id: String(user.id),
      name: this.getDisplayName(user),
      username: this.getPublicUsername(user),
      avatarUrl: user.avatar ?? '',
      relation: relationMap.get(user.id) ?? 'none',
    };
  }

  private getDisplayName(user: Pick<User, 'name' | 'email'>): string {
    if (user.name?.trim()) {
      return user.name.trim();
    }

    const localPart = user.email.split('@')[0] ?? 'Soulie User';
    return localPart
      .replace(/[._-]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private getPublicUsername(
    user: Pick<User, 'username' | 'email' | 'id'>,
  ): string {
    const username =
      user.username?.trim() ||
      user.email
        .split('@')[0]
        ?.trim()
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toLowerCase() ||
      `soulie${user.id}`;

    return `@${username}`;
  }

  private isUserOnline(user: Pick<User, 'lastSeenAt'>): boolean {
    if (!user.lastSeenAt) {
      return false;
    }

    return user.lastSeenAt.getTime() >= Date.now() - 15 * 60 * 1000;
  }

  private formatTimeAgo(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    const diffWeeks = Math.floor(diffDays / 7);
    return `${diffWeeks}w ago`;
  }

  private formatShortAge(date: Date): string {
    return this.formatTimeAgo(date).replace(' ago', '');
  }

  private formatClock(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  private formatJournalLabel(date: Date): string {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfTarget = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const diffDays = Math.floor(
      (startOfToday.getTime() - startOfTarget.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) {
      return `TODAY, ${this.formatClock(date)}`;
    }

    if (diffDays === 1) {
      return 'YESTERDAY';
    }

    if (diffDays < 7) {
      return `${diffDays} DAYS AGO`;
    }

    return date
      .toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      .toUpperCase();
  }

  private async findUserOrThrow(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private parseUserId(value: string): number {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`Invalid user id: ${value}`);
    }

    return parsed;
  }
}
