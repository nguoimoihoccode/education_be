import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { QuizService } from './quiz.service';
import { EducationService } from './education.service';
import {
  CreateQuizDto,
  UpdateQuizDto,
  CreateQuizQuestionDto,
  BulkCreateQuizQuestionDto,
  UpdateQuizQuestionDto,
  StartQuizSessionDto,
  SubmitQuizAnswerDto,
  CompleteQuizSessionDto,
  GenerateQuizFromFlashcardsDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types/auth.types';
import { Pagination } from '../../common/decorators/pagination.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ExpensiveActionRateLimit } from '../../common/decorators/rate-limit.decorator';

@ApiTags('Education - Quiz/Trắc nghiệm')
@Controller('quizzes')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(
    private readonly quizService: QuizService,
    private readonly educationService: EducationService,
  ) {}

  private getUserId(req: RequestWithUser): number {
    const userId = req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }
    return userId;
  }

  // ==================== Quiz Management ====================

  @Post()
  @ApiOperation({ summary: 'Create a new quiz' })
  @ApiResponse({ status: 201, description: 'Quiz created successfully' })
  async createQuiz(@Req() req: RequestWithUser, @Body() dto: CreateQuizDto) {
    const userId = this.getUserId(req);
    return this.quizService.createQuiz(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get user quizzes' })
  @ApiQuery({ name: 'topic', required: false, description: 'Filter by topic' })
  @ApiResponse({ status: 200, description: 'Quizzes retrieved successfully' })
  async getQuizzes(
    @Req() req: RequestWithUser,
    @Query('topic') topic?: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizzes(
      userId,
      pagination?.page,
      pagination?.limit,
      topic,
    );
  }

  @Get('public')
  @ApiOperation({ summary: 'Get public quizzes' })
  @ApiResponse({
    status: 200,
    description: 'Public quizzes retrieved successfully',
  })
  async getPublicQuizzes(@Pagination() pagination?: PaginationDto) {
    return this.quizService.getPublicQuizzes(
      pagination?.page,
      pagination?.limit,
    );
  }

  // ==================== Quiz Question Management ====================

  @Post(':id/questions')
  @ApiOperation({ summary: 'Create quiz question' })
  @ApiParam({ name: 'id', description: 'Quiz ID' })
  @ApiResponse({ status: 201, description: 'Question created successfully' })
  async createQuizQuestion(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: CreateQuizQuestionDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.createQuizQuestion(userId, id, dto);
  }

  @Post(':id/questions/bulk')
  @ApiOperation({ summary: 'Bulk create quiz questions' })
  @ApiParam({ name: 'id', description: 'Quiz ID' })
  @ApiResponse({ status: 201, description: 'Questions created successfully' })
  async bulkCreateQuizQuestions(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: BulkCreateQuizQuestionDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.bulkCreateQuizQuestions(userId, id, dto);
  }

  @Get(':id/questions')
  @ApiOperation({ summary: 'Get quiz questions' })
  @ApiParam({ name: 'id', description: 'Quiz ID' })
  @ApiResponse({ status: 200, description: 'Questions retrieved successfully' })
  async getQuizQuestions(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizQuestions(id, userId);
  }

  @Patch('questions/:questionId')
  @ApiOperation({ summary: 'Update quiz question' })
  @ApiParam({ name: 'questionId', description: 'Question ID' })
  @ApiResponse({ status: 200, description: 'Question updated successfully' })
  async updateQuizQuestion(
    @Req() req: RequestWithUser,
    @Param('questionId') questionId: string,
    @Body() dto: UpdateQuizQuestionDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.updateQuizQuestion(questionId, userId, dto);
  }

  @Delete('questions/:questionId')
  @ApiOperation({ summary: 'Delete quiz question' })
  @ApiParam({ name: 'questionId', description: 'Question ID' })
  @ApiResponse({ status: 200, description: 'Question deleted successfully' })
  async deleteQuizQuestion(
    @Req() req: RequestWithUser,
    @Param('questionId') questionId: string,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.deleteQuizQuestion(questionId, userId);
  }

  // ==================== Generate Quiz from Flashcards ====================

  @Post('generate')
  @ExpensiveActionRateLimit()
  @ApiOperation({ summary: 'Generate quiz from flashcards' })
  @ApiResponse({ status: 201, description: 'Quiz generated successfully' })
  async generateQuizFromFlashcards(
    @Req() req: RequestWithUser,
    @Body() dto: GenerateQuizFromFlashcardsDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.generateQuizFromFlashcards(userId, dto);
  }

  // ==================== Quiz Session Management ====================

  @Post(':id/start')
  @ApiOperation({ summary: 'Start quiz session' })
  @ApiParam({ name: 'id', description: 'Quiz ID' })
  @ApiResponse({ status: 201, description: 'Quiz session started' })
  async startQuizSession(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: StartQuizSessionDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.startQuizSession(userId, {
      ...dto,
      quizId: id,
    });
  }

  @Post('sessions/:sessionId/answer')
  @ApiOperation({ summary: 'Submit quiz answer' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Answer submitted successfully' })
  async submitQuizAnswer(
    @Req() req: RequestWithUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitQuizAnswerDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.submitQuizAnswer(userId, sessionId, dto);
  }

  @Post('sessions/:sessionId/complete')
  @ApiOperation({ summary: 'Complete quiz session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Quiz session completed' })
  async completeQuizSession(
    @Req() req: RequestWithUser,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = this.getUserId(req);
    const result = await this.quizService.completeQuizSession(userId, {
      sessionId,
    });
    await this.educationService.markTodayPlanTasksCompleteByType(
      String(userId),
      ['quick_quiz'],
    );
    await this.educationService.markTodayPlanTasksCompleteByTarget(
      String(userId),
      `/quiz/${result.quizId}`,
    );
    return result;
  }

  @Get('sessions/:sessionId/questions')
  @ApiOperation({ summary: 'Get quiz session questions' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({
    status: 200,
    description: 'Session questions retrieved successfully',
  })
  async getQuizSessionQuestions(
    @Req() req: RequestWithUser,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizSessionQuestions(sessionId, userId);
  }

  @Get('sessions/:sessionId')
  @ApiOperation({ summary: 'Get quiz session' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session retrieved successfully' })
  async getQuizSession(
    @Req() req: RequestWithUser,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizSession(sessionId, userId);
  }

  @Get(':id/sessions')
  @ApiOperation({ summary: 'Get quiz sessions' })
  @ApiParam({ name: 'id', description: 'Quiz ID' })
  @ApiResponse({ status: 200, description: 'Sessions retrieved successfully' })
  async getQuizSessions(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizSessions(
      userId,
      id,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Get all quiz sessions' })
  @ApiResponse({
    status: 200,
    description: 'All sessions retrieved successfully',
  })
  async getAllQuizSessions(
    @Req() req: RequestWithUser,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizSessions(
      userId,
      undefined,
      pagination?.page,
      pagination?.limit,
    );
  }

  // ==================== Statistics ====================

  @Get('stats')
  @ApiOperation({ summary: 'Get overall quiz statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getQuizStats(@Req() req: RequestWithUser) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizStats(userId);
  }

  @Get('stats/topic/:topic')
  @ApiOperation({ summary: 'Get topic-specific statistics' })
  @ApiParam({ name: 'topic', description: 'Topic name' })
  @ApiResponse({
    status: 200,
    description: 'Topic statistics retrieved successfully',
  })
  async getQuizStatsByTopic(
    @Req() req: RequestWithUser,
    @Param('topic') topic: string,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizStatsByTopic(userId, topic);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get quiz history' })
  @ApiResponse({
    status: 200,
    description: 'Quiz history retrieved successfully',
  })
  async getQuizHistory(
    @Req() req: RequestWithUser,
    @Pagination() pagination?: PaginationDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizHistory(
      userId,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Get('sessions/:sessionId/wrong')
  @ApiOperation({ summary: 'Get wrong answers' })
  @ApiParam({ name: 'sessionId', description: 'Session ID' })
  @ApiResponse({
    status: 200,
    description: 'Wrong answers retrieved successfully',
  })
  async getWrongAnswers(
    @Req() req: RequestWithUser,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.getWrongAnswers(userId, sessionId);
  }

  @Get('wrong-answers')
  @ApiOperation({ summary: 'Get all wrong answers' })
  @ApiResponse({
    status: 200,
    description: 'All wrong answers retrieved successfully',
  })
  async getAllWrongAnswers(@Req() req: RequestWithUser) {
    const userId = this.getUserId(req);
    return this.quizService.getWrongAnswers(userId);
  }

  @Get(':id/leaderboard')
  @ApiOperation({ summary: 'Get quiz leaderboard' })
  @ApiParam({ name: 'id', description: 'Quiz ID' })
  @ApiResponse({
    status: 200,
    description: 'Leaderboard retrieved successfully',
  })
  async getLeaderboard(
    @Param('id') id: string,
    @Pagination() pagination?: PaginationDto,
  ) {
    return this.quizService.getLeaderboard(
      id,
      pagination?.page,
      pagination?.limit,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update quiz' })
  @ApiParam({ name: 'id', description: 'Quiz ID' })
  @ApiResponse({ status: 200, description: 'Quiz updated successfully' })
  async updateQuiz(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateQuizDto,
  ) {
    const userId = this.getUserId(req);
    return this.quizService.updateQuiz(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete quiz' })
  @ApiParam({ name: 'id', description: 'Quiz ID' })
  @ApiResponse({ status: 200, description: 'Quiz deleted successfully' })
  async deleteQuiz(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.quizService.deleteQuiz(id, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get quiz by ID' })
  @ApiParam({ name: 'id', description: 'Quiz ID' })
  @ApiResponse({ status: 200, description: 'Quiz retrieved successfully' })
  async getQuizById(@Req() req: RequestWithUser, @Param('id') id: string) {
    const userId = this.getUserId(req);
    return this.quizService.getQuizById(id, userId);
  }
}
