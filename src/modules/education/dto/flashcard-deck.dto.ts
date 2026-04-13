import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsHexColor,
  MaxLength,
  IsEnum,
} from 'class-validator';

export class CreateFlashcardDeckDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  icon?: string;

  @IsString()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  topic?: string; // HSK1, HSK2, HSK3, etc.

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}

export class UpdateFlashcardDeckDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  icon?: string;

  @IsString()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  topic?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
