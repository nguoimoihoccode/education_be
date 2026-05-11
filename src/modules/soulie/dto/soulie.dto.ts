import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import { SoulieFriendshipStatus } from '../entities/friendship.entity';
import { SoulieMessageType } from '../entities/message.entity';

export class SoulieFriendActivityDto {
  id: string;
  name: string;
  avatarUrl: string;
  timeAgo: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export class SoulieFriendGridItemDto {
  id: string;
  name: string;
  avatarUrl: string;
  isOnline: boolean;
}

export class SoulieHomeDto {
  recentlyShared: SoulieFriendActivityDto[];
  friendsGrid: SoulieFriendGridItemDto[];
  liveFeedMessage: string;
  notificationCount: number;
}

export class SoulieFriendDto {
  id: string;
  name: string;
  username: string;
  status: string;
  isOnline: boolean;
  avatarUrl: string;
}

export class SoulieFriendsResponseDto {
  friends: SoulieFriendDto[];
  total: number;
  query: string;
  page: number;
  limit: number;
  totalPages: number;
}

export class SoulieUserSuggestionDto {
  id: string;
  name: string;
  username: string;
  email?: never;
  avatarUrl: string;
  relation: 'none' | 'incoming_request' | 'outgoing_request' | 'friend';
}

export class SoulieFriendRequestDto {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: SoulieFriendshipStatus;
  createdAt: string;
  user: SoulieFriendDto;
}

export class SoulieFriendRequestsDto {
  incoming: SoulieFriendRequestDto[];
  outgoing: SoulieFriendRequestDto[];
}

export class SoulieConversationSummaryDto {
  conversationId: string;
  friendId: string;
  friendName: string;
  friendUsername: string;
  avatarUrl: string;
  lastMessage: string;
  lastMessageType: SoulieMessageType;
  updatedAt: string;
  unreadCount: number;
  isOnline: boolean;
}

export class SoulieConversationListDto {
  conversations: SoulieConversationSummaryDto[];
  totalUnread: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class SoulieChatThreadDto {
  friendId: string;
  name: string;
  avatarUrl: string;
  lastMessage: string;
  time: string;
  isOnline: boolean;
  unread: number;
  isPhoto: boolean;
}

export class SoulieChatListDto {
  chats: SoulieChatThreadDto[];
  totalUnread: number;
}

export class SoulieChatMessageDto {
  id: string;
  text: string;
  isMe: boolean;
  time: string;
  type: SoulieMessageType;
  mediaUrl?: string;
  thumbnailUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  mimeType?: string;
  seenAt?: string;
}

export class SoulieConversationMessagesDto {
  conversationId: string;
  friend: SoulieFriendDto;
  messages: SoulieChatMessageDto[];
}

export class SoulieChatThreadDetailDto {
  friend: SoulieFriendDto;
  messages: SoulieChatMessageDto[];
}

export class SoulieJournalEntryDto {
  id: string;
  timeLabel: string;
  friendId: string;
  friendName: string;
  caption?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  createdAt: string;
}

export class SoulieWidgetDto {
  title: string;
  subtitle: string;
  highlight: string;
  friends: string[];
  notificationCount: number;
  latestMomentImageUrl?: string;
  latestMomentThumbnailUrl?: string;
  latestMomentWidth?: number;
  latestMomentHeight?: number;
}

export class SoulieJournalDto {
  totalSent: number;
  totalReceived: number;
  totalFriends: number;
  streakDays: number;
  sentEntries: SoulieJournalEntryDto[];
  receivedEntries: SoulieJournalEntryDto[];
}

export class SoulieMomentListDto {
  box: 'sent' | 'received';
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  items: SoulieJournalEntryDto[];
}

export class SoulieProfileDto {
  id: string;
  email: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  totalSent: number;
  totalReceived: number;
  friendCount: number;
  streakDays: number;
}

export class SoulieCameraRecipientDto {
  id: string;
  name: string;
  avatarUrl: string;
  isGroup: boolean;
  isOnline: boolean;
}

export class SoulieCameraRecipientsDto {
  recipients: SoulieCameraRecipientDto[];
}

export class CreateSoulieFriendRequestDto {
  @IsOptional()
  @Type(() => String)
  @IsString()
  @IsNotEmpty()
  targetUserId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateSoulieConversationDto {
  @Type(() => String)
  @IsString()
  @IsNotEmpty()
  friendId: string;
}

export class SendSoulieMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsEnum(SoulieMessageType)
  type?: SoulieMessageType;

  @IsOptional()
  @IsUrl({ require_tld: false })
  mediaUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  thumbnailUrl?: string;

  @IsOptional()
  @Type(() => Number)
  imageWidth?: number;

  @IsOptional()
  @Type(() => Number)
  imageHeight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;
}

export class CreateSoulieMomentDto {
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => String)
  @IsString({ each: true })
  recipientIds: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  thumbnailUrl?: string;

  @IsOptional()
  @Type(() => Number)
  imageWidth?: number;

  @IsOptional()
  @Type(() => Number)
  imageHeight?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;
}

export class UpdateSoulieProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,30}$/)
  username?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  avatarUrl?: string;
}
