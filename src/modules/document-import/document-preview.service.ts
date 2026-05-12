import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DocumentTextExtractionService } from './document-text-extraction.service';
import { ParserRegistry } from './parsers/parser-registry.service';
import {
  DocumentPreviewMapper,
  ImportPreviewResponse,
} from './document-preview.mapper';
import {
  ConfirmDocumentImportDto,
  DocumentPreviewRequestDto,
} from './dto/document-preview.dto';
import { FlashcardService } from '../education/flashcard.service';

@Injectable()
export class DocumentPreviewService {
  constructor(
    private readonly documentTextExtractionService: DocumentTextExtractionService,
    private readonly parserRegistry: ParserRegistry,
    private readonly documentPreviewMapper: DocumentPreviewMapper,
    private readonly flashcardService: FlashcardService,
  ) {}

  async previewDocument(
    buffer: Buffer,
    fileType: string,
    originalName: string,
    dto: DocumentPreviewRequestDto,
  ): Promise<ImportPreviewResponse> {
    const text = await this.documentTextExtractionService.extractText(
      buffer,
      fileType as any,
      originalName,
    );
    const parser = this.parserRegistry.getParser(text);
    const parsedData = await parser.parse(text, {
      language: dto.language || 'en',
      maxVocabulary: dto.maxVocabulary || 100,
      minWordLength: dto.minWordLength || 2,
      topic: dto.topic,
    });

    return this.documentPreviewMapper.toImportPreview({
      fileId: randomUUID(),
      fileName: originalName,
      fileType,
      parsedData,
      textLength: text.length,
    });
  }

  async confirmImport(userId: number, dto: ConfirmDocumentImportDto) {
    const start = Date.now();
    const deckName =
      dto.deckName || dto.fileName.replace(/\.[^.]+$/, '') || 'Imported Deck';
    const deck = await this.flashcardService.createDeck(userId, {
      name: deckName,
      description: `Generated from document preview: ${dto.fileName}`,
      color: dto.deckColor,
      icon: 'book',
      topic: dto.topic,
      isPublic: dto.deckIsPublic ?? false,
    });

    const result = await this.flashcardService.bulkCreateFlashcards(userId, {
      deckId: deck.id,
      flashcards: dto.flashcards.map((card) => ({
        front: card.front,
        back: card.back,
        pronunciation: card.pronunciation,
        example: card.example,
        exampleTranslation: card.exampleTranslation,
        description: card.description,
        notes: card.notes,
        difficulty: card.difficulty,
        tags: dto.topic ? [dto.topic] : undefined,
        deckId: deck.id,
      })),
    });

    const imported = result.created.length;
    return {
      imported,
      skipped: 0,
      failed: 0,
      deckId: deck.id,
      deckName: deck.name,
      timeSpent: Math.max(1, Math.round((Date.now() - start) / 1000)),
      errors: [],
    };
  }
}
