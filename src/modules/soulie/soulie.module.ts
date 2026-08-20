import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationToken } from './entities/notification-token.entity';
import { SoulieController } from './soulie.controller';
import { SoulieService } from './soulie.service';
import { UsersModule } from '../users/users.module';
import { SoulieConversation } from './entities/conversation.entity';
import { SoulieFriendship } from './entities/friendship.entity';
import { SoulieMessage } from './entities/message.entity';
import { SoulieMoment } from './entities/moment.entity';
import { User } from '../users/entities/user.entity';
import { FriendService } from './services/friend.service';
import { ProfileService } from './services/profile.service';
import { ConversationService } from './services/conversation.service';
import { MomentService } from './services/moment.service';
import { SoulieChatService } from './services/soulie-chat.service';
import { SoulieHomeService } from './services/soulie-home.service';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([
      NotificationToken,
      User,
      SoulieFriendship,
      SoulieConversation,
      SoulieMessage,
      SoulieMoment,
    ]),
  ],
  controllers: [SoulieController],
  providers: [
    SoulieService,
    FriendService,
    ProfileService,
    ConversationService,
    MomentService,
    SoulieChatService,
    SoulieHomeService,
  ],
  exports: [SoulieService],
})
export class SoulieModule {}
