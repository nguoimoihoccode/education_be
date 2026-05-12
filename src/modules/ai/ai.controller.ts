import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
  chat(@Body() dto: AiChatDto) {
    return this.aiService.chat(dto);
  }
}
