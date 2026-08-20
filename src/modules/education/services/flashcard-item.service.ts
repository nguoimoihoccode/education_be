import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { FlashcardDeck, Flashcard, Vocabulary, Lesson } from '../entities';
import {
  CreateFlashcardDto,
  BulkCreateFlashcardDto,
  UpdateFlashcardDto,
  ImportFromVocabularyDto,
  ImportFromVocabularyBulkDto,
} from '../dto';

@Injectable()
export class FlashcardItemService {
  constructor(
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(FlashcardDeck)
    private readonly flashcardDeckRepository: Repository<FlashcardDeck>,
    @InjectRepository(Vocabulary)
    private readonly vocabularyRepository: Repository<Vocabulary>,
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
  ) {}

  private async getOwnedDeckById(deckId: string, userId: number) {
    const deck = await this.flashcardDeckRepository.findOne({
      where: { id: deckId, userId },
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    return deck;
  }

  private async getOwnedFlashcardById(flashcardId: string, userId: number) {
    const flashcard = await this.flashcardRepository.findOne({
      where: { id: flashcardId, userId },
    });

    if (!flashcard) {
      throw new NotFoundException('Flashcard not found');
    }

    // Increment view count
    await this.flashcardRepository.increment(
      { id: flashcardId },
      'viewCount',
      1,
    );

    return flashcard;
  }

  // ==================== Flashcard CRUD ====================

  async createFlashcard(userId: number, dto: CreateFlashcardDto) {
    if (dto.deckId) {
      await this.getOwnedDeckById(dto.deckId, userId);
    }

    // Check for duplicate
    const duplicate = await this.checkDuplicateFlashcard(dto.front, userId);
    if (duplicate) {
      throw new ConflictException('Flashcard with this front already exists');
    }

    const flashcard = this.flashcardRepository.create({
      ...dto,
      userId,
      deckId: dto.deckId,
    });

    const savedFlashcard = await this.flashcardRepository.save(flashcard);

    // Update deck card count
    if (dto.deckId) {
      await this.flashcardDeckRepository.increment(
        { id: dto.deckId },
        'cardCount',
        1,
      );
    }

    return savedFlashcard;
  }

  async bulkCreateFlashcards(userId: number, dto: BulkCreateFlashcardDto) {
    if (dto.deckId) {
      await this.getOwnedDeckById(dto.deckId, userId);
    }

    const created = [];
    const skipped = [];

    for (const cardDto of dto.flashcards) {
      const duplicate = await this.checkDuplicateFlashcard(
        cardDto.front,
        userId,
      );
      if (duplicate) {
        skipped.push(cardDto.front);
        continue;
      }

      const flashcard = this.flashcardRepository.create({
        ...cardDto,
        userId,
        deckId: dto.deckId || cardDto.deckId,
      });

      const saved = await this.flashcardRepository.save(flashcard);
      created.push(saved);
    }

    // Update deck card count
    if (dto.deckId) {
      await this.flashcardDeckRepository.increment(
        { id: dto.deckId },
        'cardCount',
        created.length,
      );
    }

    return {
      created,
      skipped,
      total: created.length,
    };
  }

  async getFlashcards(
    userId: number,
    deckId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (deckId) {
      where.deckId = deckId;
    }

    const [flashcards, total] = await this.flashcardRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      flashcards,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getFlashcardById(flashcardId: string, userId: number) {
    return this.getOwnedFlashcardById(flashcardId, userId);
  }

  async updateFlashcard(
    flashcardId: string,
    userId: number,
    dto: UpdateFlashcardDto,
  ) {
    const flashcard = await this.getOwnedFlashcardById(flashcardId, userId);

    // Check for duplicate if front is being updated
    if (dto.front && dto.front !== flashcard.front) {
      const duplicate = await this.checkDuplicateFlashcard(dto.front, userId);
      if (duplicate) {
        throw new ConflictException('Flashcard with this front already exists');
      }
    }

    Object.assign(flashcard, dto);
    return this.flashcardRepository.save(flashcard);
  }

  async deleteFlashcard(flashcardId: string, userId: number) {
    const flashcard = await this.getOwnedFlashcardById(flashcardId, userId);
    const deckId = flashcard.deckId;

    await this.flashcardRepository.remove(flashcard);

    // Update deck card count
    if (deckId) {
      await this.flashcardDeckRepository.decrement(
        { id: deckId },
        'cardCount',
        1,
      );
    }

    return { message: 'Flashcard deleted successfully' };
  }

  async searchFlashcards(
    userId: number,
    query: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [flashcards, total] = await this.flashcardRepository.findAndCount({
      where: [
        { userId, front: ILike(`%${query}%`) },
        { userId, back: ILike(`%${query}%`) },
      ],
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      flashcards,
      total,
      page,
      limit,
      totalPages,
    };
  }

  // ==================== Import from Vocabulary ====================

  async importFromVocabulary(userId: number, dto: ImportFromVocabularyDto) {
    const lesson = await this.lessonRepository.findOne({
      where: { id: dto.lessonId },
      relations: ['course'],
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    const vocabularies = await this.vocabularyRepository.find({
      where: { lessonId: dto.lessonId },
    });

    let deckId = dto.deckId;

    // Create new deck if not provided
    if (!deckId || dto.createDeck) {
      // Auto-assign topic based on course level
      const topic = this.mapCourseLevelToTopic(lesson.course?.level);

      const deck = this.flashcardDeckRepository.create({
        name: `${lesson.title} - Flashcards`,
        description: `Auto-generated from lesson: ${lesson.title}`,
        type: 'SYSTEM',
        userId,
        isPublic: false,
        topic,
      });
      const savedDeck = await this.flashcardDeckRepository.save(deck);
      deckId = savedDeck.id;
    }

    let imported = 0;
    let skipped = 0;

    for (const vocab of vocabularies) {
      // Check for duplicates
      const duplicate = await this.checkDuplicateFlashcard(vocab.word, userId);
      if (duplicate) {
        skipped++;
        continue;
      }

      await this.createFlashcardFromVocabulary(vocab, deckId, userId);
      imported++;
    }

    // Update deck card count
    await this.flashcardDeckRepository.increment(
      { id: deckId },
      'cardCount',
      imported,
    );

    return { imported, skipped, deckId };
  }

  async importFromVocabularyBulk(
    userId: number,
    dto: ImportFromVocabularyBulkDto,
  ) {
    let totalImported = 0;
    let totalSkipped = 0;
    const results = [];

    for (const lessonId of dto.lessonIds) {
      try {
        const result = await this.importFromVocabulary(userId, {
          lessonId,
          deckId: dto.deckId,
          createDeck: false,
        });
        totalImported += result.imported;
        totalSkipped += result.skipped;
        results.push({
          lessonId,
          ...result,
        });
      } catch (error) {
        results.push({
          lessonId,
          error: error.message,
        });
      }
    }

    return {
      totalImported,
      totalSkipped,
      results,
    };
  }

  private async createFlashcardFromVocabulary(
    vocab: Vocabulary,
    deckId: string,
    userId: number,
  ) {
    const flashcard = this.flashcardRepository.create({
      front: vocab.word,
      back: vocab.meaning,
      pronunciation: vocab.pronunciation,
      example: vocab.example,
      exampleTranslation: vocab.exampleTranslation,
      description: vocab.notes,
      audioUrl: vocab.audioUrl,
      imageUrl: vocab.imageUrl,
      deckId,
      userId,
      sourceVocabularyId: vocab.id,
      status: 'NEW',
      difficulty: 1,
    });

    return this.flashcardRepository.save(flashcard);
  }

  private async checkDuplicateFlashcard(
    front: string,
    userId: number,
  ): Promise<boolean> {
    const existing = await this.flashcardRepository.findOne({
      where: { front, userId },
    });
    return !!existing;
  }

  private mapCourseLevelToTopic(courseLevel?: string): string {
    // Map course levels to topic names (e.g., HSK levels for Chinese)
    const levelMap: { [key: string]: string } = {
      beginner: 'HSK1',
      elementary: 'HSK2',
      intermediate: 'HSK3',
      upper_intermediate: 'HSK4',
      advanced: 'HSK5',
    };

    return levelMap[courseLevel || ''] || 'General';
  }
}
