import { Injectable, Logger } from '@nestjs/common';
import { FlashcardService } from '../../education/flashcard.service';
import { CreateFlashcardDeckDto } from '../../education/dto/flashcard-deck.dto';
import {
  CreateFlashcardDto,
  BulkCreateFlashcardDto,
} from '../../education/dto/flashcard.dto';
import { ContentGenerator } from './content-generator.abstract';
import {
  ContentType,
  ParsedDocumentData,
  GeneratedContentDto,
} from '../dto/document-conversion.dto';

@Injectable()
export class FlashcardGenerator extends ContentGenerator {
  constructor(private readonly flashcardService: FlashcardService) {
    super();
  }

  getContentType(): ContentType {
    return ContentType.FLASHCARDS;
  }

  canGenerate(data: ParsedDocumentData, options: any): boolean {
    const vocabItems = data.vocabulary || [];
    return (
      vocabItems.length > 0 &&
      options.contentTypes?.includes(ContentType.FLASHCARDS)
    );
  }

  async generate(
    userId: number,
    data: ParsedDocumentData,
    options: any,
  ): Promise<GeneratedContentDto> {
    const vocabItems = data.vocabulary || [];
    if (vocabItems.length === 0) {
      return {
        contentType: ContentType.FLASHCARDS,
        name: options.deckName || 'Empty Flashcards',
        id: '',
        itemCount: 0,
      };
    }

    const deckName = options.deckName || this.generateDeckName(data);
    const topic = options.topic || data.metadata?.detectedTopic;

    const deckDto: CreateFlashcardDeckDto = {
      name: deckName,
      description: `Generated from document: ${data.metadata?.detectedTopic || 'Imported'}`,
      color: options.deckColor,
      icon: 'book',
      topic,
      isPublic: options.deckIsPublic ?? false,
    };

    const deck = await this.flashcardService.createDeck(userId, deckDto);

    const flashcardDtos: CreateFlashcardDto[] = vocabItems.map((item) => ({
      front: item.word,
      back: item.definition || '',
      pronunciation: item.pronunciation,
      example: item.example,
      exampleTranslation: item.exampleTranslation,
      description: item.description,
      notes: item.partOfSpeech
        ? `Part of speech: ${item.partOfSpeech}`
        : undefined,
      difficulty: item.difficulty || 1,
      tags: item.tags,
      deckId: deck.id,
    }));

    const bulkDto: BulkCreateFlashcardDto = {
      flashcards: flashcardDtos,
      deckId: deck.id,
    };

    const result = await this.flashcardService.bulkCreateFlashcards(
      userId,
      bulkDto,
    );
    const createdFlashcards = result.created;

    return {
      contentType: ContentType.FLASHCARDS,
      name: deckName,
      id: deck.id,
      itemCount: createdFlashcards.length,
      createdItems: createdFlashcards.map((f) => f.id),
      details: {
        deckId: deck.id,
        deckName: deck.name,
        cardCount: createdFlashcards.length,
      },
    };
  }

  private generateDeckName(data: ParsedDocumentData): string {
    if (data.courseOutline?.title) {
      return `${data.courseOutline.title} - Flashcards`;
    }
    const date = new Date().toISOString().split('T')[0];
    return `Vocabulary Deck (${date})`;
  }
}
