import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import {
  SoulieCameraRecipientDto,
  SoulieCameraRecipientsDto,
  SoulieFriendActivityDto,
  SoulieFriendGridItemDto,
  SoulieHomeDto,
  SoulieWidgetDto,
} from '../dto/soulie.dto';
import {
  SoulieFriendship,
  SoulieFriendshipStatus,
} from '../entities/friendship.entity';
import { SoulieMessage } from '../entities/message.entity';
import { SoulieMoment } from '../entities/moment.entity';
import { FriendService } from './friend.service';
import {
  formatTimeAgo,
  getDisplayName,
  isUserOnline,
} from '../domain/soulie-utils';

@Injectable()
export class SoulieHomeService {
  constructor(
    private readonly friendService: FriendService,
    @InjectRepository(SoulieFriendship)
    private readonly friendshipRepository: Repository<SoulieFriendship>,
    @InjectRepository(SoulieMoment)
    private readonly momentRepository: Repository<SoulieMoment>,
    @InjectRepository(SoulieMessage)
    private readonly messageRepository: Repository<SoulieMessage>,
  ) {}

  async getHome(userId: number): Promise<SoulieHomeDto> {
    const [friends, recentMoments, notificationCount] = await Promise.all([
      this.friendService.getAcceptedFriendUsers(userId),
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
          ? `${getDisplayName(friends[0])} shared a moment with you`
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
        ? `${getDisplayName(latestMoment.sender)} shared a moment`
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

  async getCameraRecipients(
    userId: number,
  ): Promise<SoulieCameraRecipientsDto> {
    const friends = await this.friendService.getAcceptedFriendUsers(userId);
    const recipients: SoulieCameraRecipientDto[] = [
      {
        id: 'all-friends',
        name: 'All Friends',
        avatarUrl: '',
        isGroup: true,
        isOnline: friends.some((friend) => isUserOnline(friend)),
      },
      ...friends.map((friend) => ({
        id: String(friend.id),
        name: getDisplayName(friend),
        avatarUrl: friend.avatar ?? '',
        isGroup: false,
        isOnline: isUserOnline(friend),
      })),
    ];

    return { recipients };
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

  private toFriendActivityDto(
    sender: User,
    moment: SoulieMoment,
  ): SoulieFriendActivityDto {
    return {
      id: String(sender.id),
      name: getDisplayName(sender),
      avatarUrl: sender.avatar ?? '',
      timeAgo: formatTimeAgo(moment.createdAt),
      imageUrl: moment.imageUrl ?? undefined,
      thumbnailUrl: moment.thumbnailUrl ?? undefined,
      imageWidth: moment.imageWidth ?? undefined,
      imageHeight: moment.imageHeight ?? undefined,
    };
  }

  private toFriendGridItemDto(user: User): SoulieFriendGridItemDto {
    return {
      id: String(user.id),
      name: getDisplayName(user),
      avatarUrl: user.avatar ?? '',
      isOnline: isUserOnline(user),
    };
  }
}
