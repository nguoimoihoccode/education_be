import { Module } from '@nestjs/common';
import { EducationModule } from '../education/education.module';
import { AiModule } from '../ai/ai.module';

import { DocumentImportController } from './document-import.controller';
import { DocumentImportService } from './document-import.service';
import { DocumentTextExtractionService } from './document-text-extraction.service';
import { KeywordExtractionService } from './keyword-extraction.service';
import { DocumentConversionService } from './document-conversion.service';
import { DocumentPreviewMapper } from './document-preview.mapper';
import { DocumentPreviewService } from './document-preview.service';
import { AiVocabEnricherService } from './ai-vocab-enricher.service';
import {
  DOCUMENT_PARSERS,
  ParserRegistry,
} from './parsers/parser-registry.service';
import { FreetextParser } from './parsers/freetext-parser.service';
import { MarkdownParser } from './parsers/markdown-parser.service';
import { JsonParser } from './parsers/json-parser.service';
import { StructuredParser } from './parsers/structured-parser.service';
import { FlashcardGenerator } from './generators/flashcard-generator.service';
import { VocabularyGenerator } from './generators/vocabulary-generator.service';
import { LessonGenerator } from './generators/lesson-generator.service';
import { QuizGenerator } from './generators/quiz-generator.service';

@Module({
  imports: [EducationModule, AiModule],
  controllers: [DocumentImportController],
  providers: [
    DocumentImportService,
    DocumentTextExtractionService,
    KeywordExtractionService,
    DocumentConversionService,
    DocumentPreviewMapper,
    DocumentPreviewService,
    AiVocabEnricherService,
    ParserRegistry,
    // Parsers
    FreetextParser,
    MarkdownParser,
    JsonParser,
    StructuredParser,
    {
      provide: DOCUMENT_PARSERS,
      useFactory: (
        freetextParser: FreetextParser,
        markdownParser: MarkdownParser,
        jsonParser: JsonParser,
        structuredParser: StructuredParser,
      ) => [structuredParser, jsonParser, markdownParser, freetextParser],
      inject: [FreetextParser, MarkdownParser, JsonParser, StructuredParser],
    },
    // Generators
    FlashcardGenerator,
    VocabularyGenerator,
    LessonGenerator,
    QuizGenerator,
  ],
  exports: [
    DocumentImportService,
    DocumentTextExtractionService,
    KeywordExtractionService,
    DocumentConversionService,
    DocumentPreviewService,
    ParserRegistry,
  ],
})
export class DocumentImportModule {}
