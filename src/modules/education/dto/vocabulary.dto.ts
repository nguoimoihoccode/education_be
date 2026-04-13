import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateVocabularyDto {
  @IsNotEmpty()
  @IsString()
  word: string;

  @IsNotEmpty()
  @IsString()
  meaning: string;

  @IsOptional()
  @IsString()
  pronunciation?: string;

  @IsOptional()
  @IsString()
  audioUrl?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  example?: string;

  @IsOptional()
  @IsString()
  exampleTranslation?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  partOfSpeech?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  difficulty?: number = 1;

  @IsNotEmpty()
  @IsString()
  lessonId: string;
}

export class ReviewVocabularyDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(5)
  quality: number; // 0-5 rating: 0=complete blackout, 5=perfect response
}

export class BulkCreateVocabularyDto {
  vocabularies: CreateVocabularyDto[];

  @IsNotEmpty()
  @IsString()
  lessonId: string;
}
