import { BadRequestException } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';
import { SoulieFriendship } from '../entities/friendship.entity';
import {
  SoulieFriendDto,
  SoulieFriendRequestDto,
  SoulieUserSuggestionDto,
} from '../dto/soulie.dto';

export type MomentBox = 'sent' | 'received';
export type DiscoverRelation =
  | 'none'
  | 'incoming_request'
  | 'outgoing_request'
  | 'friend';

export function getDisplayName(user: Pick<User, 'name' | 'email'>): string {
  if (user.name?.trim()) {
    return user.name.trim();
  }

  const localPart = user.email.split('@')[0] ?? 'Soulie User';
  return localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function getPublicDisplayName(user: Pick<User, 'name' | 'id'>): string {
  if (user.name?.trim()) {
    return user.name.trim();
  }

  return `Soulie User ${user.id}`;
}

export function getPublicUsername(user: Pick<User, 'username' | 'id'>): string {
  const username = user.username?.trim() || `soulie${user.id}`;

  return `@${username}`;
}

export function isUserOnline(user: Pick<User, 'lastSeenAt'>): boolean {
  if (!user.lastSeenAt) {
    return false;
  }

  return user.lastSeenAt.getTime() >= Date.now() - 15 * 60 * 1000;
}

export function formatTimeAgo(date: Date): string {
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

export function formatShortAge(date: Date): string {
  return formatTimeAgo(date).replace(' ago', '');
}

export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function calculateStreak(dates: Date[]): number {
  if (dates.length === 0) {
    return 0;
  }

  const dateSet = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  while (dateSet.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function parseUserId(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException(`Invalid user id: ${value}`);
  }

  return parsed;
}

export function toFriendDto(user: User): SoulieFriendDto {
  return {
    id: String(user.id),
    name: getPublicDisplayName(user),
    username: getPublicUsername(user),
    status: isUserOnline(user)
      ? 'Active now'
      : user.lastSeenAt
        ? `Active ${formatTimeAgo(user.lastSeenAt)}`
        : 'Offline',
    isOnline: isUserOnline(user),
    avatarUrl: user.avatar ?? '',
  };
}

export function toFriendRequestDto(
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
    user: toFriendDto(user),
  };
}

export function toUserSuggestionDto(
  user: User,
  relationMap: Map<number, DiscoverRelation>,
): SoulieUserSuggestionDto {
  return {
    id: String(user.id),
    name: getDisplayName(user),
    username: getPublicUsername(user),
    avatarUrl: user.avatar ?? '',
    relation: relationMap.get(user.id) ?? 'none',
  };
}
