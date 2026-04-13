import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsEnum,
} from 'class-validator';

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
}
