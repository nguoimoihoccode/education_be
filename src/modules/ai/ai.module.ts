import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UsersModule } from '../users/users.module';
import { AiController } from './ai.controller';
import { AI_FETCH_CLIENT, AiService } from './ai.service';
import { AiConversation } from './entities/ai-conversation.entity';
import { AiMessage } from './entities/ai-message.entity';
import { AiProviderSettings } from './entities/ai-provider-settings.entity';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([AiConversation, AiMessage, AiProviderSettings]),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    { provide: AI_FETCH_CLIENT, useValue: fetch },
    RolesGuard,
  ],
  exports: [AiService],
})
export class AiModule {}
