import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFlashcardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  front: string;

  @IsString()
  @IsNotEmpty()
  back: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  pronunciation?: string;

  @IsString()
  @IsOptional()
  example?: string;

  @IsString()
  @IsOptional()
  exampleTranslation?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  audioUrl?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  difficulty?: number;

  @IsString()
  @IsOptional()
  deckId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}

export class BulkCreateFlashcardDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFlashcardDto)
  flashcards: CreateFlashcardDto[];

  @IsString()
  @IsOptional()
  deckId?: string;
}

export class UpdateFlashcardDto {
  @IsString()
  @IsOptional()
  @MaxLength(500)
  front?: string;

  @IsString()
  @IsOptional()
  back?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  pronunciation?: string;

  @IsString()
  @IsOptional()
  example?: string;

  @IsString()
  @IsOptional()
  exampleTranslation?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  audioUrl?: string;

  @IsString()
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  @IsOptional()
  difficulty?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];
}
