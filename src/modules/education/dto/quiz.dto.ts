import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsEnum,
} from 'class-validator';

export class CreateQuizDto {
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
  @MaxLength(100)
  topic?: string;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED'])
  @IsOptional()
  questionType?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MIXED';

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  questionCount?: number;

  @IsNumber()
  @Min(30)
  @Max(3600)
  @IsOptional()
  timeLimit?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  passingScore?: number;

  @IsEnum(['EASY', 'MEDIUM', 'HARD', 'MIXED'])
  @IsOptional()
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  @IsBoolean()
  @IsOptional()
  shuffleAnswers?: boolean;

  @IsBoolean()
  @IsOptional()
  showCorrectAnswer?: boolean;

  @IsBoolean()
  @IsOptional()
  allowRetry?: boolean;

  @IsNumber()
  @Min(0)
  @Max(10)
  @IsOptional()
  maxRetries?: number;
}

export class UpdateQuizDto {
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
  @MaxLength(100)
  topic?: string;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED'])
  @IsOptional()
  questionType?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MIXED';

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  questionCount?: number;

  @IsNumber()
  @Min(30)
  @Max(3600)
  @IsOptional()
  timeLimit?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  passingScore?: number;

  @IsEnum(['EASY', 'MEDIUM', 'HARD', 'MIXED'])
  @IsOptional()
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsBoolean()
  @IsOptional()
  shuffleQuestions?: boolean;

  @IsBoolean()
  @IsOptional()
  shuffleAnswers?: boolean;

  @IsBoolean()
  @IsOptional()
  showCorrectAnswer?: boolean;

  @IsBoolean()
  @IsOptional()
  allowRetry?: boolean;

  @IsNumber()
  @Min(0)
  @Max(10)
  @IsOptional()
  maxRetries?: number;
}
