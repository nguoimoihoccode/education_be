import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  ValidateNested,
  IsObject,
  IsHexColor,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const toOptionalNumber = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }

  return value;
};

const toOptionalBoolean = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    if (value === 'true' || value === '1') {
      return true;
    }

    if (value === 'false' || value === '0') {
      return false;
    }
  }

  return value;
};

const toStringArray = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.includes(',')) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [value];
};

// ==================== Enums ====================

export enum ContentType {
  FLASHCARDS = 'FLASHCARDS',
  VOCABULARY = 'VOCABULARY',
  LESSONS = 'LESSONS',
  QUIZZES = 'QUIZZES',
  COURSES = 'COURSES',
}

export enum DocumentStructureType {
  FREETEXT = 'FREETEXT',
  MARKDOWN = 'MARKDOWN',
  STRUCTURED = 'STRUCTURED',
  JSON = 'JSON',
  CSV = 'CSV',
  QAPAIR = 'QAPAIR',
}

export enum QuestionType {
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
  TRUE_FALSE = 'TRUE_FALSE',
  FILL_BLANK = 'FILL_BLANK',
  MIXED = 'MIXED',
}

export enum QuizDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
  MIXED = 'MIXED',
}

export class CustomMappingDto {
  @IsArray()
  @IsString()
  @IsOptional()
  vocabularyTopics?: string[];

  @IsArray()
  @IsString()
  @IsOptional()
  lessonTitles?: string[];

  @IsObject()
  @IsOptional()
  quizSettings?: Record<string, any>;
}

// ==================== Request DTOs ====================

export class DocumentConversionRequestDto {
  @IsEnum(DocumentStructureType)
  @IsOptional()
  structureType?: DocumentStructureType;

  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(ContentType, { each: true })
  contentTypes: ContentType[];

  @IsString()
  @IsOptional()
  topic?: string; // Manual topic override (e.g., HSK1, HSK2)

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  @IsOptional()
  autoDetectTopic?: boolean; // Auto-detect topic from content

  @IsString()
  @IsOptional()
  language?: string; // Language code (en, vi, ja, zh)

  // Flashcard options
  @IsString()
  @IsOptional()
  deckName?: string;

  @IsString()
  @IsOptional()
  @IsHexColor()
  deckColor?: string;

  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  @IsOptional()
  deckIsPublic?: boolean;

  // Lesson options
  @IsString()
  @IsOptional()
  courseName?: string;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(1)
  @IsOptional()
  lessonCount?: number; // How many lessons to generate

  // Quiz options
  @IsEnum(QuestionType)
  @IsOptional()
  quizQuestionType?: QuestionType;

  @IsEnum(QuizDifficulty)
  @IsOptional()
  quizDifficulty?: QuizDifficulty;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  quizQuestionCount?: number;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(30)
  @Max(3600)
  @IsOptional()
  quizTimeLimit?: number;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  quizPassingScore?: number;

  // Vocabulary options
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(1)
  @Max(500)
  @IsOptional()
  maxVocabulary?: number;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  minWordLength?: number;

  // Global options
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  @IsOptional()
  createDeckForQuiz?: boolean; // Create a flashcard deck for quiz vocabulary

  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomMappingDto)
  customMappings?: CustomMappingDto;
}

// ==================== Response DTOs ====================

export class DocumentConversionResponseDto {
  @IsString()
  id: string;

  @IsString()
  originalName: string;

  @IsString()
  fileType: string;

  @IsNumber()
  fileSize: number;

  @IsString()
  structureType: DocumentStructureType;

  @IsString()
  detectedTopic?: string;

  @IsString()
  usedTopic: string;

  @IsNumber()
  textLength: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeneratedContentDto)
  generatedContent: GeneratedContentDto[];

  @IsNumber()
  processingTime: number;

  @IsString()
  processedAt: string;
}

export class GeneratedContentDto {
  @IsEnum(ContentType)
  contentType: ContentType;

  @IsString()
  name: string;

  @IsString()
  id: string; // Entity ID (deckId, courseId, quizId, etc.)

  @IsNumber()
  itemCount: number; // Number of items created

  @IsArray()
  @IsString()
  @IsOptional()
  createdItems?: string[]; // IDs of created items

  @IsObject()
  @IsOptional()
  details?: Record<string, any>;
}

// ==================== Parser Output DTOs ====================

export interface ParsedVocabularyItem {
  word: string;
  definition?: string;
  pronunciation?: string;
  example?: string;
  exampleTranslation?: string;
  description?: string;
  partOfSpeech?: string;
  difficulty?: number;
  tags?: string[];
}

export interface ParsedQAPair {
  question: string;
  answer: string;
  type?: QuestionType;
  options?: string[];
  explanation?: string;
  difficulty?: number;
}

export interface ParsedLesson {
  title: string;
  content: string;
  sections?: ParsedLessonSection[];
  order: number;
  vocabulary?: ParsedVocabularyItem[];
  exercises?: ParsedQAPair[];
}

export interface ParsedLessonSection {
  heading: string;
  content: string;
  order: number;
}

export interface ParsedCourseOutline {
  title: string;
  description?: string;
  lessons: ParsedLesson[];
  level?: number;
}

export interface ParsedDocumentData {
  structureType: DocumentStructureType;
  rawText: string;
  vocabulary: ParsedVocabularyItem[];
  qaPairs: ParsedQAPair[];
  lessons: ParsedLesson[];
  courseOutline?: ParsedCourseOutline;
  metadata: {
    wordCount: number;
    language?: string;
    detectedTopic?: string;
    confidence: number;
  };
}

// ==================== File Upload DTO (extended) ====================

export class DocumentUploadAndConvertDto {
  @IsString()
  @IsOptional()
  structureType?: DocumentStructureType;

  @IsArray()
  @IsEnum(ContentType, { each: true })
  contentTypes: ContentType[];

  @IsString()
  @IsOptional()
  topic?: string;

  @IsBoolean()
  @IsOptional()
  autoDetectTopic?: boolean;

  @IsString()
  @IsOptional()
  language?: string;

  // All flashcard options
  @IsString()
  @IsOptional()
  deckName?: string;

  @IsString()
  @IsOptional()
  @IsHexColor()
  deckColor?: string;

  @IsBoolean()
  @IsOptional()
  deckIsPublic?: boolean;

  // Lesson options
  @IsString()
  @IsOptional()
  courseName?: string;

  @IsNumber()
  @Min(1)
  @IsOptional()
  lessonCount?: number;

  // Quiz options
  @IsEnum(QuestionType)
  @IsOptional()
  quizQuestionType?: QuestionType;

  @IsEnum(QuizDifficulty)
  @IsOptional()
  quizDifficulty?: QuizDifficulty;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  quizQuestionCount?: number;

  @IsNumber()
  @Min(30)
  @Max(3600)
  @IsOptional()
  quizTimeLimit?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  quizPassingScore?: number;

  // Vocabulary options
  @IsNumber()
  @Min(1)
  @Max(500)
  @IsOptional()
  maxVocabulary?: number;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  minWordLength?: number;

  // Global options
  @IsBoolean()
  @IsOptional()
  createDeckForQuiz?: boolean;

  @IsObject()
  @IsOptional()
  customMappings?: Record<string, any>;
}
