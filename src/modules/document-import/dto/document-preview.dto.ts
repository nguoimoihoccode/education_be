import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const toOptionalNumber = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

const toOptionalBoolean = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
  }
  return value;
};

export class DocumentPreviewRequestDto {
  @IsString()
  @IsOptional()
  language?: string;

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

  @IsString()
  @IsOptional()
  topic?: string;
}

export class ConfirmFlashcardDto {
  @IsString()
  id: string;

  @IsString()
  front: string;

  @IsString()
  back: string;

  @IsString()
  @IsOptional()
  pronunciation?: string;

  @IsString()
  @IsOptional()
  example?: string;

  @IsString()
  @IsOptional()
  exampleTranslation?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  difficulty: number;
}

export class ConfirmDocumentImportDto {
  @IsString()
  fileName: string;

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

  @IsString()
  @IsOptional()
  topic?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmFlashcardDto)
  flashcards: ConfirmFlashcardDto[];
}
