import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExpensiveActionRateLimit } from '../../common/decorators/rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums/roles.enum';
import type { RequestWithUser } from '../../common/types/auth.types';
import { AiService } from './ai.service';
import { AiChatDto } from './dto/ai-chat.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { ReindexKnowledgeDto } from './dto/reindex-knowledge.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';
import { KnowledgeIndexService } from './knowledge-index.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';

@ApiTags('AI Tutor')
@ApiBearerAuth('JWT-auth')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    // Injected here rather than behind AiService: the index is an admin
    // operation that happens to live under /ai, and ai.service.ts is already a
    // large file that chat concerns should stay in.
    private readonly knowledgeIndex: KnowledgeIndexService,
    // Same reasoning as knowledgeIndex: retrieval stats are an admin read over
    // the log the retrieval tier writes, not a chat concern.
    private readonly knowledgeRetrieval: KnowledgeRetrievalService,
  ) {}

  private userId(req: RequestWithUser): number {
    return req.user!.sub;
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List AI conversations' })
  listConversations(@Req() req: RequestWithUser) {
    return this.aiService.listConversations(this.userId(req));
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Create AI conversation' })
  createConversation(
    @Req() req: RequestWithUser,
    @Body() dto: CreateConversationDto,
  ) {
    return this.aiService.createConversation(this.userId(req), dto);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation with messages' })
  getConversation(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.aiService.getConversation(this.userId(req), id);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete conversation' })
  async deleteConversation(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
  ) {
    await this.aiService.deleteConversation(this.userId(req), id);
  }

  @Post('conversations/:id/messages')
  @ExpensiveActionRateLimit()
  @ApiOperation({ summary: 'Send message in conversation' })
  sendMessage(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.aiService.sendMessage(this.userId(req), id, dto.message);
  }

  @Post('chat')
  @ExpensiveActionRateLimit()
  @ApiOperation({ summary: 'Legacy one-shot / continue chat' })
  chat(@Req() req: RequestWithUser, @Body() dto: AiChatDto) {
    return this.aiService.chat(this.userId(req), dto);
  }

  @Get('settings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  @ApiOperation({ summary: 'Get AI provider settings (admin)' })
  getSettings() {
    return this.aiService.getSettings();
  }

  @Put('settings')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  @ExpensiveActionRateLimit()
  @ApiOperation({ summary: 'Update AI provider settings (admin)' })
  updateSettings(
    @Req() req: RequestWithUser,
    @Body() dto: UpdateAiSettingsDto,
  ) {
    return this.aiService.updateSettings(this.userId(req), dto);
  }

  @Post('settings/test')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  @ExpensiveActionRateLimit()
  @ApiOperation({ summary: 'Test AI provider connection (admin)' })
  testSettings() {
    return this.aiService.testSettings();
  }

  /** Tokens and USD spent on AI calls, ?from=YYYY-MM-DD&to=YYYY-MM-DD. */
  @Get('usage')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  getUsage(@Query('from') from: string, @Query('to') to: string) {
    return this.aiService.getUsage(from, to);
  }

  @Get('knowledge/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  @ApiOperation({
    summary: 'Knowledge index health: chunk counts, pending embeddings',
  })
  knowledgeStatus() {
    return this.knowledgeIndex.status();
  }

  @Post('knowledge/reindex')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  @ExpensiveActionRateLimit()
  @ApiOperation({
    summary: 'Rebuild the RAG knowledge index for one lesson or the corpus',
  })
  reindexKnowledge(@Body() dto: ReindexKnowledgeDto) {
    return dto.lessonId
      ? this.knowledgeIndex.reindexLesson(dto.lessonId, { force: dto.force })
      : this.knowledgeIndex.reindexAll({ force: dto.force });
  }

  @Get('knowledge/retrieval-stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.EDUCATION_ADMIN)
  @ApiOperation({
    summary:
      'Retrieval distance statistics — the evidence base for tuning the threshold',
  })
  retrievalStats(@Query('days') days?: string) {
    // A bad `days` falls back to the default inside stats(), so no ceremony
    // beyond handing a number (or nothing) over.
    return this.knowledgeRetrieval.stats(
      days === undefined ? undefined : Number(days),
    );
  }
}
