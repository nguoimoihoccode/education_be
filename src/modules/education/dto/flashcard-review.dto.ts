import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReviewFlashcardDto {
  @IsString()
  @IsNotEmpty()
  flashcardId: string;

  @IsNumber()
  @Min(0)
  @Max(5)
  @IsNotEmpty()
  quality: number;
}

export class StartReviewSessionDto {
  @IsString()
  @IsOptional()
  deckId?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @IsEnum(['DAILY', 'DECK', 'CUSTOM'])
  @IsOptional()
  type?: 'DAILY' | 'DECK' | 'CUSTOM';
}

export class CompleteReviewSessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewFlashcardResultDto)
  @IsOptional()
  results?: ReviewFlashcardResultDto[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  skippedCards?: number;
}

export class ReviewFlashcardResultDto {
  @IsString()
  @IsNotEmpty()
  flashcardId: string;

  @IsNumber()
  @Min(0)
  @Max(5)
  quality: number;

  @IsOptional()
  isCorrect?: boolean;

  @IsNumber()
  @Min(0)
  @IsOptional()
  timeSpent?: number;
}
