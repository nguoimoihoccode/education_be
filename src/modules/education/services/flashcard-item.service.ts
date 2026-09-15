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

    // Saving the card and bumping the deck counter are one unit — a failure
    // in between would leave cardCount out of sync with the deck contents.
    return this.flashcardRepository.manager.transaction(async (manager) => {
      const savedFlashcard = await manager
        .getRepository(Flashcard)
        .save(flashcard);

      if (dto.deckId) {
        await manager
          .getRepository(FlashcardDeck)
          .increment({ id: dto.deckId }, 'cardCount', 1);
      }

      return savedFlashcard;
    });
  }

  async bulkCreateFlashcards(userId: number, dto: BulkCreateFlashcardDto) {
    if (dto.deckId) {
      await this.getOwnedDeckById(dto.deckId, userId);
    }

    const created: Flashcard[] = [];
    const skipped = [];
    // Batch-local duplicate tracking: same-batch fronts would otherwise slip
    // past checkDuplicateFlashcard (which reads outside the transaction).
    const seenFronts = new Set<string>();

    for (const cardDto of dto.flashcards) {
      const duplicate =
        seenFronts.has(cardDto.front) ||
        (await this.checkDuplicateFlashcard(cardDto.front, userId));
      if (duplicate) {
        skipped.push(cardDto.front);
        continue;
      }
      seenFronts.add(cardDto.front);

      created.push(
        this.flashcardRepository.create({
          ...cardDto,
          userId,
          deckId: dto.deckId || cardDto.deckId,
        }),
      );
    }

    // All cards plus the single deck-count bump commit together.
    const savedFlashcards = await this.flashcardRepository.manager.transaction(
      async (manager) => {
        const flashcardRepository = manager.getRepository(Flashcard);
        const saved = [];
        for (const flashcard of created) {
          saved.push(await flashcardRepository.save(flashcard));
        }

        if (dto.deckId && saved.length > 0) {
          await manager
            .getRepository(FlashcardDeck)
            .increment({ id: dto.deckId }, 'cardCount', saved.length);
        }

        return saved;
      },
    );

    return {
      created: savedFlashcards,
      skipped,
      total: savedFlashcards.length,
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

    // Removing the card and decrementing the deck counter are one unit.
    await this.flashcardRepository.manager.transaction(async (manager) => {
      await manager.getRepository(Flashcard).remove(flashcard);

      if (deckId) {
        await manager
          .getRepository(FlashcardDeck)
          .decrement({ id: deckId }, 'cardCount', 1);
      }
    });

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

    // The deck (when freshly created), its cards, and the card counter all
    // commit together — a mid-import failure must not leave an empty deck.
    return this.flashcardRepository.manager.transaction(async (manager) => {
      const flashcardDeckRepository = manager.getRepository(FlashcardDeck);
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
        const savedDeck = await flashcardDeckRepository.save(deck);
        deckId = savedDeck.id;
      }

      let skipped = 0;
      // Batch-local duplicate tracking: same-batch words would otherwise
      // slip past checkDuplicateFlashcard (which reads outside the txn).
      const seenFronts = new Set<string>();
      const flashcardRepository = manager.getRepository(Flashcard);
      const saved = [];

      for (const vocab of vocabularies) {
        const duplicate =
          seenFronts.has(vocab.word) ||
          (await this.checkDuplicateFlashcard(vocab.word, userId));
        if (duplicate) {
          skipped++;
          continue;
        }
        seenFronts.add(vocab.word);

        saved.push(
          await flashcardRepository.save(
            this.createFlashcardFromVocabulary(vocab, deckId, userId),
          ),
        );
      }

      await flashcardDeckRepository.increment(
        { id: deckId },
        'cardCount',
        saved.length,
      );

      return { imported: saved.length, skipped, deckId };
    });
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

  private createFlashcardFromVocabulary(
    vocab: Vocabulary,
    deckId: string,
    userId: number,
  ) {
    // Builds the entity only — the caller persists it inside its transaction.
    return this.flashcardRepository.create({
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
