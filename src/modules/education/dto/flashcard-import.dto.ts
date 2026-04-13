import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class ImportFromVocabularyDto {
  @IsString()
  @IsNotEmpty()
  lessonId: string;

  @IsString()
  @IsOptional()
  deckId?: string;

  @IsBoolean()
  @IsOptional()
  createDeck?: boolean;
}

export class ImportFromVocabularyBulkDto {
  @IsArray()
  @IsString({ each: true })
  lessonIds: string[];

  @IsString()
  @IsOptional()
  deckId?: string;
}
