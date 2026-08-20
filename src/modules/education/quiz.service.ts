import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Quiz,
  QuizQuestion,
  QuizSession,
  Flashcard,
  FlashcardDeck,
} from './entities';
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
import { AiService } from '../ai/ai.service';
import { QuizManagementService } from './services/quiz-management.service';
import { QuizQuestionService } from './services/quiz-question.service';
import { QuizGenerationService } from './services/quiz-generation.service';
import { QuizSessionService } from './services/quiz-session.service';
import { QuizStatisticsService } from './services/quiz-statistics.service';

@Injectable()
export class QuizService {
  private readonly quizManagementService: QuizManagementService;
  private readonly quizQuestionService: QuizQuestionService;
  private readonly quizGenerationService: QuizGenerationService;
  private readonly quizSessionService: QuizSessionService;
  private readonly quizStatisticsService: QuizStatisticsService;

  constructor(
    @InjectRepository(Quiz)
    quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    quizQuestionRepository: Repository<QuizQuestion>,
    @InjectRepository(QuizSession)
    quizSessionRepository: Repository<QuizSession>,
    @InjectRepository(Flashcard)
    flashcardRepository: Repository<Flashcard>,
    @InjectRepository(FlashcardDeck)
    flashcardDeckRepository: Repository<FlashcardDeck>,
    aiService: AiService,
  ) {
    // The use-case services are instantiated manually here (rather than via
    // Nest DI constructor injection) because quiz.service.spec.ts constructs
    // `new QuizService(repo1..repo6)` and must remain unchanged. Once that spec
    // constraint is relaxed, these can be switched to DI-injected providers.
    this.quizManagementService = new QuizManagementService(quizRepository);
    this.quizQuestionService = new QuizQuestionService(
      quizRepository,
      quizQuestionRepository,
    );
    this.quizGenerationService = new QuizGenerationService(
      quizRepository,
      quizQuestionRepository,
      flashcardRepository,
      aiService,
    );
    this.quizSessionService = new QuizSessionService(
      quizRepository,
      quizQuestionRepository,
      quizSessionRepository,
    );
    this.quizStatisticsService = new QuizStatisticsService(
      quizRepository,
      quizQuestionRepository,
      quizSessionRepository,
      aiService,
    );
  }

  // ==================== Quiz Management ====================

  async createQuiz(userId: number, dto: CreateQuizDto) {
    return this.quizManagementService.createQuiz(userId, dto);
  }

  async getQuizzes(
    userId: number,
    page: number = 1,
    limit: number = 10,
    topic?: string,
  ) {
    return this.quizManagementService.getQuizzes(userId, page, limit, topic);
  }

  async getQuizById(quizId: string, userId: number) {
    return this.quizManagementService.getQuizById(quizId, userId);
  }

  async updateQuiz(quizId: string, userId: number, dto: UpdateQuizDto) {
    return this.quizManagementService.updateQuiz(quizId, userId, dto);
  }

  async deleteQuiz(quizId: string, userId: number) {
    return this.quizManagementService.deleteQuiz(quizId, userId);
  }

  async getPublicQuizzes(page: number = 1, limit: number = 10) {
    return this.quizManagementService.getPublicQuizzes(page, limit);
  }

  // ==================== Quiz Question Management ====================

  async createQuizQuestion(
    userId: number,
    quizId: string,
    dto: CreateQuizQuestionDto,
  ) {
    return this.quizQuestionService.createQuizQuestion(userId, quizId, dto);
  }

  async bulkCreateQuizQuestions(
    userId: number,
    quizId: string,
    dto: BulkCreateQuizQuestionDto,
  ) {
    return this.quizQuestionService.bulkCreateQuizQuestions(
      userId,
      quizId,
      dto,
    );
  }

  async getQuizQuestions(quizId: string, userId: number) {
    return this.quizQuestionService.getQuizQuestions(quizId, userId);
  }

  async updateQuizQuestion(
    questionId: string,
    userId: number,
    dto: UpdateQuizQuestionDto,
  ) {
    return this.quizQuestionService.updateQuizQuestion(questionId, userId, dto);
  }

  async deleteQuizQuestion(questionId: string, userId: number) {
    return this.quizQuestionService.deleteQuizQuestion(questionId, userId);
  }

  // ==================== Generate Quiz from Flashcards ====================

  async generateQuizFromFlashcards(
    userId: number,
    dto: GenerateQuizFromFlashcardsDto,
  ) {
    return this.quizGenerationService.generateQuizFromFlashcards(userId, dto);
  }

  // ==================== Quiz Session Management ====================

  async startQuizSession(userId: number, dto: StartQuizSessionDto) {
    return this.quizSessionService.startQuizSession(userId, dto);
  }

  async submitQuizAnswer(
    userId: number,
    sessionId: string,
    dto: SubmitQuizAnswerDto,
  ) {
    return this.quizSessionService.submitQuizAnswer(userId, sessionId, dto);
  }

  async completeQuizSession(userId: number, dto: CompleteQuizSessionDto) {
    return this.quizSessionService.completeQuizSession(userId, dto);
  }

  async getQuizSession(sessionId: string, userId: number) {
    return this.quizSessionService.getQuizSession(sessionId, userId);
  }

  async getQuizSessionQuestions(sessionId: string, userId: number) {
    return this.quizSessionService.getQuizSessionQuestions(sessionId, userId);
  }

  async getQuizSessions(
    userId: number,
    quizId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    return this.quizSessionService.getQuizSessions(userId, quizId, page, limit);
  }

  // ==================== Statistics & Progress ====================

  async getQuizStats(userId: number) {
    return this.quizStatisticsService.getQuizStats(userId);
  }

  async getQuizStatsByTopic(userId: number, topic: string) {
    return this.quizStatisticsService.getQuizStatsByTopic(userId, topic);
  }

  async getQuizHistory(userId: number, page: number = 1, limit: number = 10) {
    return this.quizStatisticsService.getQuizHistory(userId, page, limit);
  }

  async getWrongAnswers(userId: number, sessionId?: string) {
    return this.quizStatisticsService.getWrongAnswers(userId, sessionId);
  }

  async getLeaderboard(quizId: string, page: number = 1, limit: number = 10) {
    return this.quizStatisticsService.getLeaderboard(quizId, page, limit);
  }

  // ==================== Internal (spec/companion access) ====================

  private async generateMultipleChoiceQuestion(
    flashcard: Flashcard,
  ): Promise<Partial<CreateQuizQuestionDto>> {
    return this.quizGenerationService.generateMultipleChoiceQuestion(flashcard);
  }
}

export {
  buildQuizSessionQuestionOrder,
  isQuestionInSessionOrder,
  hasAnsweredQuestion,
  calculateQuizSessionProgress,
  buildQuizStatsResult,
  buildTopicQuizStatsResult,
} from './domain/quiz-helpers';
