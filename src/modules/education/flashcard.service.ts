import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  FlashcardDeck,
  Flashcard,
  UserFlashcard,
  ReviewSession,
} from './entities';
import { Vocabulary } from './entities/vocabulary.entity';
import { Lesson } from './entities/lesson.entity';
import { UserStreak } from './entities/user-streak.entity';
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
import { FlashcardDeckService } from './services/flashcard-deck.service';
import { FlashcardItemService } from './services/flashcard-item.service';
import { FlashcardReviewService } from './services/flashcard-review.service';
import { FlashcardStatisticsService } from './services/flashcard-statistics.service';

@Injectable()
export class FlashcardService {
  private readonly deckService: FlashcardDeckService;
  private readonly itemService: FlashcardItemService;
  private readonly reviewService: FlashcardReviewService;
  private readonly statisticsService: FlashcardStatisticsService;

  constructor(
    @InjectRepository(FlashcardDeck)
    private readonly flashcardDeckRepository: Repository<FlashcardDeck>,
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(UserFlashcard)
    private readonly userFlashcardRepository: Repository<UserFlashcard>,
    @InjectRepository(ReviewSession)
    private readonly reviewSessionRepository: Repository<ReviewSession>,
    @InjectRepository(Vocabulary)
    private readonly vocabularyRepository: Repository<Vocabulary>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
  ) {
    // The use-case services are instantiated manually here (rather than via
    // Nest DI constructor injection) because flashcard.service.spec.ts constructs
    // `new FlashcardService(7 repos)` and must remain unchanged. Once that spec
    // constraint is relaxed, these can be switched to DI-injected providers.
    this.deckService = new FlashcardDeckService(flashcardDeckRepository);
    this.itemService = new FlashcardItemService(
      flashcardRepository,
      flashcardDeckRepository,
      vocabularyRepository,
      lessonRepository,
    );
    this.reviewService = new FlashcardReviewService(
      flashcardRepository,
      userFlashcardRepository,
      reviewSessionRepository,
      userStreakRepository,
    );
    this.statisticsService = new FlashcardStatisticsService(
      flashcardRepository,
      flashcardDeckRepository,
      userFlashcardRepository,
      reviewSessionRepository,
      userStreakRepository,
    );
  }

  // ==================== Deck Management ====================

  async createDeck(userId: number, dto: CreateFlashcardDeckDto) {
    return this.deckService.createDeck(userId, dto);
  }

  async getDecks(
    userId: number,
    page: number = 1,
    limit: number = 10,
    topic?: string,
  ) {
    return this.deckService.getDecks(userId, page, limit, topic);
  }

  async getDeckById(deckId: string, userId: number) {
    return this.deckService.getDeckById(deckId, userId);
  }

  async updateDeck(
    deckId: string,
    userId: number,
    dto: UpdateFlashcardDeckDto,
  ) {
    return this.deckService.updateDeck(deckId, userId, dto);
  }

  async deleteDeck(deckId: string, userId: number) {
    return this.deckService.deleteDeck(deckId, userId);
  }

  async getPublicDecks(page: number = 1, limit: number = 10) {
    return this.deckService.getPublicDecks(page, limit);
  }

  async getDecksByTopic(
    userId: number,
    topic: string,
    page: number = 1,
    limit: number = 10,
  ) {
    return this.deckService.getDecksByTopic(userId, topic, page, limit);
  }

  async getAvailableTopics(userId: number) {
    return this.deckService.getAvailableTopics(userId);
  }

  // ==================== Flashcard CRUD ====================

  async createFlashcard(userId: number, dto: CreateFlashcardDto) {
    return this.itemService.createFlashcard(userId, dto);
  }

  async bulkCreateFlashcards(userId: number, dto: BulkCreateFlashcardDto) {
    return this.itemService.bulkCreateFlashcards(userId, dto);
  }

  async getFlashcards(
    userId: number,
    deckId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    return this.itemService.getFlashcards(userId, deckId, page, limit);
  }

  async getFlashcardById(flashcardId: string, userId: number) {
    return this.itemService.getFlashcardById(flashcardId, userId);
  }

  async updateFlashcard(
    flashcardId: string,
    userId: number,
    dto: UpdateFlashcardDto,
  ) {
    return this.itemService.updateFlashcard(flashcardId, userId, dto);
  }

  async deleteFlashcard(flashcardId: string, userId: number) {
    return this.itemService.deleteFlashcard(flashcardId, userId);
  }

  async searchFlashcards(
    userId: number,
    query: string,
    page: number = 1,
    limit: number = 10,
  ) {
    return this.itemService.searchFlashcards(userId, query, page, limit);
  }

  // ==================== Import from Vocabulary ====================

  async importFromVocabulary(userId: number, dto: ImportFromVocabularyDto) {
    return this.itemService.importFromVocabulary(userId, dto);
  }

  async importFromVocabularyBulk(
    userId: number,
    dto: ImportFromVocabularyBulkDto,
  ) {
    return this.itemService.importFromVocabularyBulk(userId, dto);
  }

  // ==================== Review System ====================

  async startReviewSession(userId: number, dto: StartReviewSessionDto) {
    return this.reviewService.startReviewSession(userId, dto);
  }

  async reviewFlashcard(userId: number, dto: ReviewFlashcardDto) {
    return this.reviewService.reviewFlashcard(userId, dto);
  }

  async completeReviewSession(userId: number, dto: CompleteReviewSessionDto) {
    return this.reviewService.completeReviewSession(userId, dto);
  }

  async getFlashcardsToReview(userId: number, deckId?: string, limit?: number) {
    return this.reviewService.getFlashcardsToReview(userId, deckId, limit);
  }

  async getDueFlashcardsCount(userId: number, deckId?: string) {
    return this.reviewService.getDueFlashcardsCount(userId, deckId);
  }

  // ==================== Statistics & Progress ====================

  async getFlashcardStats(userId: number) {
    return this.statisticsService.getFlashcardStats(userId);
  }

  async getDeckStats(userId: number, deckId: string) {
    return this.statisticsService.getDeckStats(userId, deckId);
  }

  async getReviewHistory(userId: number, page: number = 1, limit: number = 10) {
    return this.statisticsService.getReviewHistory(userId, page, limit);
  }
}

export {
  buildFlashcardStatsResult,
  buildDeckStatsResult,
} from './services/flashcard-statistics.service';
export type {
  FlashcardStatsResultInput,
  DeckStatsResultInput,
} from './services/flashcard-statistics.service';
