import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';
import {
  CreateSoulieMomentDto,
  SoulieJournalDto,
  SoulieJournalEntryDto,
  SoulieMomentListDto,
} from '../dto/soulie.dto';
import { SoulieMoment } from '../entities/moment.entity';
import { FriendService } from './friend.service';
import { ProfileService } from './profile.service';
import {
  MomentBox,
  formatClock,
  getDisplayName,
  parseUserId,
} from '../domain/soulie-utils';

@Injectable()
export class MomentService {
  constructor(
    @InjectRepository(SoulieMoment)
    private readonly momentRepository: Repository<SoulieMoment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly friendService: FriendService,
    private readonly profileService: ProfileService,
    private readonly usersService: UsersService,
  ) {}

  async createMoment(userId: number, dto: CreateSoulieMomentDto) {
    const recipientIds = await this.resolveMomentRecipientIds(
      userId,
      dto.recipientIds,
    );
    const recipients = await this.userRepository.find({
      where: { id: In(recipientIds) },
    });
    const recipientMap = new Map(
      recipients.map((recipient) => [recipient.id, getDisplayName(recipient)]),
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
              getDisplayName(moment.recipient),
            )
          : this.toJournalEntryDtoFromMoment(
              moment,
              String(moment.senderId),
              getDisplayName(moment.sender),
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
      this.profileService.getProfileStats(userId),
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

  private async resolveMomentRecipientIds(
    userId: number,
    rawRecipientIds: string[],
  ): Promise<number[]> {
    if (rawRecipientIds.includes('all-friends')) {
      const friends = await this.friendService.getAcceptedFriendUsers(userId);
      if (friends.length === 0) {
        throw new BadRequestException('You do not have any friends to send to');
      }
      return friends.map((friend) => friend.id);
    }

    const recipientIds = rawRecipientIds.map((recipientId) =>
      parseUserId(recipientId),
    );
    const friends = await this.friendService.getAcceptedFriendUsers(userId);
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
      return `TODAY, ${formatClock(date)}`;
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
}
