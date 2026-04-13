import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuizQuestionDto {
  @IsString()
  @IsNotEmpty()
  question: string;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'])
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsString()
  @IsNotEmpty()
  correctAnswer: string;

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  points?: number;

  @IsString()
  @IsOptional()
  flashcardId?: string;
}

export class BulkCreateQuizQuestionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuizQuestionDto)
  questions: CreateQuizQuestionDto[];
}

export class UpdateQuizQuestionDto {
  @IsString()
  @IsOptional()
  question?: string;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK'])
  @IsOptional()
  type?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK';

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsString()
  @IsOptional()
  correctAnswer?: string;

  @IsString()
  @IsOptional()
  explanation?: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  points?: number;
}
