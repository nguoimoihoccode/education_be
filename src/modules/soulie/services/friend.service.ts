import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../../users/users.service';
import { User } from '../../users/entities/user.entity';
import {
  CreateSoulieFriendRequestDto,
  SoulieFriendRequestDto,
  SoulieFriendRequestsDto,
  SoulieFriendsResponseDto,
  SoulieUserSuggestionDto,
} from '../dto/soulie.dto';
import {
  SoulieFriendship,
  SoulieFriendshipStatus,
} from '../entities/friendship.entity';
import {
  DiscoverRelation,
  getPublicDisplayName,
  getPublicUsername,
  parseUserId,
  toFriendDto,
  toFriendRequestDto,
  toUserSuggestionDto,
} from '../domain/soulie-utils';

@Injectable()
export class FriendService {
  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(SoulieFriendship)
    private readonly friendshipRepository: Repository<SoulieFriendship>,
  ) {}

  async getFriends(
    userId: number,
    query?: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<SoulieFriendsResponseDto> {
    const normalizedQuery = (query ?? '').trim().toLowerCase();
    const friends = await this.getAcceptedFriendUsers(userId);
    const result = friends
      .map((friend) => toFriendDto(friend))
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
      .map((candidate) => toUserSuggestionDto(candidate, relationMap))
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
        toFriendRequestDto(request, 'incoming'),
      ),
      outgoing: outgoing.map((request) =>
        toFriendRequestDto(request, 'outgoing'),
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
      return toFriendRequestDto(saved, 'incoming');
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

    return toFriendRequestDto(populated, 'outgoing');
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
    return toFriendRequestDto(saved, 'incoming');
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
    return toFriendRequestDto(saved, 'incoming');
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

  async getAcceptedFriendUsers(userId: number): Promise<User[]> {
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
      const parsedId = parseUserId(dto.targetUserId);
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

  async resolveAcceptedFriend(userId: number, friendKey: string) {
    const friends = await this.getAcceptedFriendUsers(userId);
    const normalizedKey = friendKey.trim().toLowerCase();

    const match = friends.find((friend) => {
      const name = getPublicDisplayName(friend).toLowerCase();
      const slug = name.replace(/\s+/g, '-');
      const username = getPublicUsername(friend).replace('@', '').toLowerCase();

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
}
