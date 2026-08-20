import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';
import { SoulieProfileDto, UpdateSoulieProfileDto } from '../dto/soulie.dto';
import {
  SoulieFriendship,
  SoulieFriendshipStatus,
} from '../entities/friendship.entity';
import { SoulieMoment } from '../entities/moment.entity';
import {
  calculateStreak,
  getDisplayName,
  getPublicUsername,
} from '../domain/soulie-utils';

@Injectable()
export class ProfileService {
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SoulieFriendship)
    private readonly friendshipRepository: Repository<SoulieFriendship>,
    @InjectRepository(SoulieMoment)
    private readonly momentRepository: Repository<SoulieMoment>,
  ) {}

  async getProfile(userId: number): Promise<SoulieProfileDto> {
    const user = await this.findUserOrThrow(userId);
    const stats = await this.getProfileStats(userId);

    return {
      id: String(user.id),
      email: user.email,
      displayName: getDisplayName(user),
      username: getPublicUsername(user),
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

  async getProfileStats(userId: number) {
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
      streakDays: calculateStreak(
        sentMoments.map((moment) => moment.createdAt),
      ),
    };
  }

  private async findUserOrThrow(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
