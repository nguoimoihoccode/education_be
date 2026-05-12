import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AI_FETCH_CLIENT, AiService } from './ai.service';

@Module({
  controllers: [AiController],
  providers: [AiService, { provide: AI_FETCH_CLIENT, useValue: fetch }],
  exports: [AiService],
})
export class AiModule {}
