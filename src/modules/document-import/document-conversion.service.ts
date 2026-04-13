import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentConversionRequestDto,
  DocumentConversionResponseDto,
  GeneratedContentDto,
} from './dto/document-conversion.dto';
import { DocumentTextExtractionService } from './document-text-extraction.service';
import { ParserRegistry } from './parsers/parser-registry.service';
import { FlashcardGenerator } from './generators/flashcard-generator.service';
import { VocabularyGenerator } from './generators/vocabulary-generator.service';
import { LessonGenerator } from './generators/lesson-generator.service';
import { QuizGenerator } from './generators/quiz-generator.service';
import { ContentGenerator } from './generators/content-generator.abstract';
import { ParsedDocumentData } from './dto/document-conversion.dto';

interface ConversionResult {
  contentType: string;
  name: string;
  id: string;
  itemCount: number;
  createdItems?: string[];
  details?: any;
}

@Injectable()
export class DocumentConversionService {
  private readonly logger = new Logger(DocumentConversionService.name);
  private readonly generators: ContentGenerator[];

  constructor(
    private readonly documentTextExtractionService: DocumentTextExtractionService,
    private readonly parserRegistry: ParserRegistry,
    flashcardGenerator: FlashcardGenerator,
    vocabularyGenerator: VocabularyGenerator,
    lessonGenerator: LessonGenerator,
    quizGenerator: QuizGenerator,
  ) {
    this.generators = [
      flashcardGenerator,
      vocabularyGenerator,
      lessonGenerator,
      quizGenerator,
    ];
  }

  async convertDocument(
    userId: number,
    buffer: Buffer,
    fileType: string,
    originalName: string,
    dto: DocumentConversionRequestDto,
  ): Promise<DocumentConversionResponseDto> {
    const start = Date.now();

    try {
      this.logger.log(`Converting document: ${originalName} (${fileType})`);
      const text = await this.documentTextExtractionService.extractText(
        buffer,
        fileType as any,
        originalName,
      );
      this.logger.debug(`Extracted ${text.length} characters`);

      const parser = this.parserRegistry.getParser(text, dto.structureType);
      this.logger.log(`Using parser: ${parser.constructor.name}`);

      const parseOptions = {
        language: dto.language || 'en',
        maxVocabulary: dto.maxVocabulary || 100,
        minWordLength: dto.minWordLength || 2,
        ...dto,
      };

      const parsedData: ParsedDocumentData = await parser.parse(
        text,
        parseOptions,
      );
      this.logger.log(
        `Parsed: ${parsedData.vocabulary.length} vocab, ${parsedData.qaPairs.length} Q&A, ${parsedData.lessons.length} lessons`,
      );

      const results: GeneratedContentDto[] = [];

      for (const generator of this.generators) {
        if (generator.canGenerate(parsedData, dto)) {
          this.logger.log(`Generating ${generator.getContentType()}...`);
          const result = await generator.generate(userId, parsedData, dto);
          if (result.itemCount > 0) {
            results.push(result);
            this.logger.log(`Created ${result.itemCount} items`);
          } else {
            this.logger.debug(
              `Generator ${generator.getContentType()} returned no items`,
            );
          }
        }
      }

      const duration = Date.now() - start;
      this.logger.log(`Conversion completed in ${duration}ms`);

      const id = `${userId}-${Date.now()}`;
      const structureType = parsedData.structureType;
      const detectedTopic = parsedData.metadata.detectedTopic;
      const usedTopic = dto.topic || detectedTopic || '';
      const fileSize = buffer.length;

      return {
        id,
        originalName,
        fileType,
        fileSize,
        structureType,
        detectedTopic,
        usedTopic,
        textLength: text.length,
        generatedContent: results,
        processingTime: duration,
        processedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Conversion failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
