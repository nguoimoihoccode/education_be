import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { ExpensiveActionRateLimit } from '../../common/decorators/rate-limit.decorator';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';

@ApiTags('AI Tutor')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ExpensiveActionRateLimit()
  @ApiOperation({ summary: 'Chat with the AI language tutor' })
  chat(@Req() req: Request, @Body() dto: AiChatDto) {
    const userId = Number(
      (req.user as { sub?: number; id?: number } | undefined)?.sub ??
        (req.user as { sub?: number; id?: number } | undefined)?.id,
    );
    return this.aiService.chat(userId, dto);
  }
}
