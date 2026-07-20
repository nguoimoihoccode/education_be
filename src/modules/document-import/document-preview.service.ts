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
import {
  AiVocabEnricherService,
  EnrichedCard,
} from './ai-vocab-enricher.service';
import {
  ParsedDocumentData,
  ParsedVocabularyItem,
} from './dto/document-conversion.dto';

@Injectable()
export class DocumentPreviewService {
  constructor(
    private readonly documentTextExtractionService: DocumentTextExtractionService,
    private readonly parserRegistry: ParserRegistry,
    private readonly documentPreviewMapper: DocumentPreviewMapper,
    private readonly flashcardService: FlashcardService,
    private readonly aiVocabEnricherService: AiVocabEnricherService,
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

    const enriched = await this.aiVocabEnricherService.enrichVocabulary({
      rawText: text,
      seedTerms: parsedData.vocabulary.map((item) => item.word).filter(Boolean),
      language: dto.language || parsedData.metadata.language || 'en',
      maxCards: dto.maxVocabulary || 40,
    });

    const dataForPreview = enriched
      ? this.applyEnrichedVocabulary(parsedData, enriched)
      : parsedData;

    return this.documentPreviewMapper.toImportPreview({
      fileId: randomUUID(),
      fileName: originalName,
      fileType,
      parsedData: dataForPreview,
      textLength: text.length,
    });
  }

  private applyEnrichedVocabulary(
    parsedData: ParsedDocumentData,
    enriched: EnrichedCard[],
  ): ParsedDocumentData {
    const byFront = new Map(
      enriched.map((card) => [card.front.trim().toLowerCase(), card]),
    );

    const mergedFromHeuristic: ParsedVocabularyItem[] =
      parsedData.vocabulary.map((item) => {
        const match = byFront.get(item.word.trim().toLowerCase());
        if (!match) {
          return item;
        }
        return {
          ...item,
          definition: match.back || item.definition,
          pronunciation: match.pronunciation ?? item.pronunciation,
          example: match.example ?? item.example,
          exampleTranslation:
            match.exampleTranslation ?? item.exampleTranslation,
          difficulty: match.difficulty ?? item.difficulty,
        };
      });

    const existingWords = new Set(
      mergedFromHeuristic.map((item) => item.word.trim().toLowerCase()),
    );
    const extraFromAi: ParsedVocabularyItem[] = enriched
      .filter((card) => !existingWords.has(card.front.trim().toLowerCase()))
      .map((card) => ({
        word: card.front,
        definition: card.back,
        pronunciation: card.pronunciation,
        example: card.example,
        exampleTranslation: card.exampleTranslation,
        difficulty: card.difficulty,
      }));

    const vocabulary =
      mergedFromHeuristic.length > 0
        ? [...mergedFromHeuristic, ...extraFromAi]
        : enriched.map((card) => ({
            word: card.front,
            definition: card.back,
            pronunciation: card.pronunciation,
            example: card.example,
            exampleTranslation: card.exampleTranslation,
            difficulty: card.difficulty,
          }));

    return {
      ...parsedData,
      vocabulary,
    };
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
