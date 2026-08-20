import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlashcardDeck } from '../entities';
import { CreateFlashcardDeckDto, UpdateFlashcardDeckDto } from '../dto';

@Injectable()
export class FlashcardDeckService {
  constructor(
    @InjectRepository(FlashcardDeck)
    private readonly flashcardDeckRepository: Repository<FlashcardDeck>,
  ) {}

  // ==================== Deck Management ====================

  async createDeck(userId: number, dto: CreateFlashcardDeckDto) {
    const deck = this.flashcardDeckRepository.create({
      ...dto,
      userId,
      cardCount: 0,
    });
    return this.flashcardDeckRepository.save(deck);
  }

  async getDecks(
    userId: number,
    page: number = 1,
    limit: number = 10,
    topic?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (topic) {
      where.topic = topic;
    }

    const [decks, total] = await this.flashcardDeckRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      decks,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getDeckById(deckId: string, userId: number) {
    const deck = await this.flashcardDeckRepository.findOne({
      where: { id: deckId, userId },
    });

    if (!deck) {
      throw new NotFoundException('Deck not found');
    }

    return deck;
  }

  async updateDeck(
    deckId: string,
    userId: number,
    dto: UpdateFlashcardDeckDto,
  ) {
    const deck = await this.getDeckById(deckId, userId);
    Object.assign(deck, dto);
    return this.flashcardDeckRepository.save(deck);
  }

  async deleteDeck(deckId: string, userId: number) {
    const deck = await this.getDeckById(deckId, userId);
    await this.flashcardDeckRepository.remove(deck);
    return { message: 'Deck deleted successfully' };
  }

  async getPublicDecks(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [decks, total] = await this.flashcardDeckRepository.findAndCount({
      where: { isPublic: true },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      decks,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getDecksByTopic(
    userId: number,
    topic: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    const [decks, total] = await this.flashcardDeckRepository.findAndCount({
      where: { userId, topic },
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    const totalPages = Math.ceil(total / limit);

    return {
      decks,
      total,
      page,
      limit,
      totalPages,
      topic,
    };
  }

  async getAvailableTopics(userId: number) {
    const topics = await this.flashcardDeckRepository
      .createQueryBuilder('deck')
      .select('deck.topic', 'topic')
      .addSelect('COUNT(*)', 'count')
      .where('deck.userId = :userId', { userId })
      .andWhere('deck.topic IS NOT NULL')
      .groupBy('deck.topic')
      .orderBy('deck.topic', 'ASC')
      .getRawMany();

    return topics.map((item) => ({
      topic: item.topic,
      count: parseInt(item.count),
    }));
  }
}
