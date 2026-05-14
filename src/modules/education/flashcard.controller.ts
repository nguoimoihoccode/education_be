import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { FlashcardService } from './flashcard.service';
import { EducationService } from './education.service';
import {
  CreateFlashcardDeckDto,
  UpdateFlashcardDeckDto,
  CreateFlashcardDto,
  BulkCreateFlashcardDto,
  UpdateFlashcardDto,
  ReviewFlashcardDto,
  StartReviewSessionDto,
  CompleteReviewSessionDto,
  ImportFromVocabularyDto,
  ImportFromVocabularyBulkDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types/auth.types';
import { Pagination } from '../../common/decorators/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('Education - Flashcards')
@Controller('flashcards')
@UseGuards(JwtAuthGuard)
export class FlashcardController {
  constructor(
    private readonly flashcardService: FlashcardService,
    private readonly educationService: EducationService,
  ) {}

  private getUserId(req: RequestWithUser): number {
    const userId = req.user?.sub;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    return userId;
  }

  // ==================== Deck Management ====================

  @Post('decks')
  @ApiOperation({ summary: 'Create a new flashcard deck' })
  @ApiResponse({ status: 201, description: 'Deck created successfully' })
  async createDeck(
    @Req() req: RequestWithUser,
    @Body() dto: CreateFlashcardDeckDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.createDeck(userId, dto);
  }

  @Get('decks')
  @ApiOperation({ summary: 'Get user flashcard decks' })
  @ApiQuery({ name: 'topic', required: false, description: 'Filter by topic' })
  @ApiResponse({ status: 200, description: 'Decks retrieved successfully' })
  async getDecks(
    @Req() req: RequestWithUser,
    @Query('topic') topic?: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.getDecks(
      userId,
      pagination?.page,
      pagination?.limit,
      topic,
    );
  }

  @Get('decks/public')
  @ApiOperation({ summary: 'Get public flashcard decks' })
  @ApiResponse({
    status: 200,
    description: 'Public decks retrieved successfully',
  })
  async getPublicDecks(@Pagination() pagination?: PaginationDto) {
    return this.flashcardService.getPublicDecks(
      pagination?.page,
      pagination?.limit,
    );
  }

  @Get('decks/:id')
  @ApiOperation({ summary: 'Get deck by ID' })
  @ApiParam({ name: 'id', description: 'Deck ID' })
  @ApiResponse({ status: 200, description: 'Deck retrieved successfully' })
  async getDeckById(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.flashcardService.getDeckById(id, userId);
  }

  @Patch('decks/:id')
  @ApiOperation({ summary: 'Update deck' })
  @ApiParam({ name: 'id', description: 'Deck ID' })
  @ApiResponse({ status: 200, description: 'Deck updated successfully' })
  async updateDeck(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateFlashcardDeckDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.updateDeck(id, userId, dto);
  }

  @Delete('decks/:id')
  @ApiOperation({ summary: 'Delete deck' })
  @ApiParam({ name: 'id', description: 'Deck ID' })
  @ApiResponse({ status: 200, description: 'Deck deleted successfully' })
  async deleteDeck(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.flashcardService.deleteDeck(id, userId);
  }

  @Get('decks/topic/:topic')
  @ApiOperation({ summary: 'Get decks by topic' })
  @ApiParam({ name: 'topic', description: 'Topic name (e.g., HSK1, HSK2)' })
  @ApiResponse({
    status: 200,
    description: 'Decks by topic retrieved successfully',
  })
  async getDecksByTopic(
    @Req() req: RequestWithUser,
    @Param('topic') topic: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.getDecksByTopic(
      userId,
      topic,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Get('topics')
  @ApiOperation({ summary: 'Get all available topics' })
  @ApiResponse({
    status: 200,
    description: 'Available topics retrieved successfully',
  })
  async getAvailableTopics(@Req() req: RequestWithUser) {
    const userId = this.getUserId(req);
    return this.flashcardService.getAvailableTopics(userId);
  }

  // ==================== Flashcard Management ====================

  @Post()
  @ApiOperation({ summary: 'Create a new flashcard' })
  @ApiResponse({ status: 201, description: 'Flashcard created successfully' })
  async createFlashcard(
    @Req() req: RequestWithUser,
    @Body() dto: CreateFlashcardDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.createFlashcard(userId, dto);
  }

  @Post('bulk')
  @ApiOperation({ summary: 'Bulk create flashcards' })
  @ApiResponse({ status: 201, description: 'Flashcards created successfully' })
  async bulkCreateFlashcards(
    @Req() req: RequestWithUser,
    @Body() dto: BulkCreateFlashcardDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.bulkCreateFlashcards(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get flashcards' })
  @ApiQuery({
    name: 'deckId',
    required: false,
    description: 'Filter by deck ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Flashcards retrieved successfully',
  })
  async getFlashcards(
    @Req() req: RequestWithUser,
    @Query('deckId') deckId?: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.getFlashcards(
      userId,
      deckId,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Get('search')
  @ApiOperation({ summary: 'Search flashcards' })
  @ApiQuery({ name: 'q', required: true, description: 'Search query' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async searchFlashcards(
    @Req() req: RequestWithUser,
    @Query('q') query: string,
    @Query('query') frontendQuery?: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = this.getUserId(req);
    const searchQuery = query || frontendQuery;

    if (!searchQuery) {
      throw new BadRequestException('Search query is required');
    }

    return this.flashcardService.searchFlashcards(
      userId,
      searchQuery,
      pagination?.page,
      pagination?.limit,
    );
  }

  // ==================== Import from Vocabulary ====================

  @Post('import/vocabulary')
  @ApiOperation({ summary: 'Import flashcards from vocabulary lesson' })
  @ApiResponse({ status: 201, description: 'Flashcards imported successfully' })
  async importFromVocabulary(
    @Req() req: RequestWithUser,
    @Body() dto: ImportFromVocabularyDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.importFromVocabulary(userId, dto);
  }

  @Post('import/vocabulary/bulk')
  @ApiOperation({ summary: 'Bulk import flashcards from vocabulary lessons' })
  @ApiResponse({ status: 201, description: 'Flashcards imported successfully' })
  async importFromVocabularyBulk(
    @Req() req: RequestWithUser,
    @Body() dto: ImportFromVocabularyBulkDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.importFromVocabularyBulk(userId, dto);
  }

  // ==================== Review System ====================

  @Post('review/start')
  @ApiOperation({ summary: 'Start a review session' })
  @ApiResponse({ status: 201, description: 'Review session started' })
  async startReviewSession(
    @Req() req: RequestWithUser,
    @Body() dto: StartReviewSessionDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.startReviewSession(userId, dto);
  }

  @Post('review/complete')
  @ApiOperation({ summary: 'Complete a review session' })
  @ApiResponse({ status: 200, description: 'Review session completed' })
  async completeReviewSession(
    @Req() req: RequestWithUser,
    @Body() dto: CompleteReviewSessionDto,
  ) {
    const userId = this.getUserId(req);
    const result = await this.flashcardService.completeReviewSession(userId, dto);
    await this.educationService.markTodayPlanTasksCompleteByType(
      String(userId),
      ['review_flashcards', 'review_vocabulary'],
    );
    return result;
  }

  @Post('review/:flashcardId')
  @ApiOperation({ summary: 'Review a flashcard' })
  @ApiParam({ name: 'flashcardId', description: 'Flashcard ID' })
  @ApiResponse({ status: 200, description: 'Flashcard reviewed successfully' })
  async reviewFlashcard(
    @Req() req: RequestWithUser,
    @Param('flashcardId') flashcardId: string,
    @Body() dto: ReviewFlashcardDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.reviewFlashcard(userId, {
      ...dto,
      flashcardId,
    });
  }

  @Get('review/due')
  @ApiOperation({ summary: 'Get due flashcards for review' })
  @ApiQuery({
    name: 'deckId',
    required: false,
    description: 'Filter by deck ID',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit results' })
  @ApiResponse({ status: 200, description: 'Due flashcards retrieved' })
  async getDueFlashcards(
    @Req() req: RequestWithUser,
    @Query('deckId') deckId?: string,
    @Query('limit') limit?: number,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.getFlashcardsToReview(userId, deckId, limit);
  }

  @Get('review/stats')
  @ApiOperation({ summary: 'Get review statistics' })
  @ApiResponse({ status: 200, description: 'Review statistics retrieved' })
  async getReviewStats(@Req() req: RequestWithUser) {
    const userId = this.getUserId(req);
    return this.flashcardService.getFlashcardStats(userId);
  }

  // ==================== Statistics ====================

  @Get('stats')
  @ApiOperation({ summary: 'Get overall flashcard statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved' })
  async getStats(@Req() req: RequestWithUser) {
    const userId = this.getUserId(req);
    return this.flashcardService.getFlashcardStats(userId);
  }

  @Get('decks/:id/stats')
  @ApiOperation({ summary: 'Get deck-specific statistics' })
  @ApiParam({ name: 'id', description: 'Deck ID' })
  @ApiResponse({ status: 200, description: 'Deck statistics retrieved' })
  async getDeckStats(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.flashcardService.getDeckStats(userId, id);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get review history' })
  @ApiResponse({ status: 200, description: 'Review history retrieved' })
  async getReviewHistory(
    @Req() req: RequestWithUser,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.getReviewHistory(
      userId,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get flashcard by ID' })
  @ApiParam({ name: 'id', description: 'Flashcard ID' })
  @ApiResponse({ status: 200, description: 'Flashcard retrieved successfully' })
  async getFlashcardById(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.flashcardService.getFlashcardById(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update flashcard' })
  @ApiParam({ name: 'id', description: 'Flashcard ID' })
  @ApiResponse({ status: 200, description: 'Flashcard updated successfully' })
  async updateFlashcard(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateFlashcardDto,
  ) {
    const userId = this.getUserId(req);
    return this.flashcardService.updateFlashcard(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete flashcard' })
  @ApiParam({ name: 'id', description: 'Flashcard ID' })
  @ApiResponse({ status: 200, description: 'Flashcard deleted successfully' })
  async deleteFlashcard(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.flashcardService.deleteFlashcard(id, userId);
  }
}
