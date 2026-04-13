import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsEnum,
} from 'class-validator';

export class StartQuizSessionDto {
  @IsString()
  @IsNotEmpty()
  quizId: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  questionCount?: number;
}

export class SubmitQuizAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  answer: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  timeSpent?: number;
}

export class CompleteQuizSessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}

export class GenerateQuizFromFlashcardsDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  topic?: string;

  @IsString()
  @IsOptional()
  deckId?: string;

  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  questionCount?: number;

  @IsEnum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED'])
  @IsOptional()
  questionType?: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'FILL_BLANK' | 'MIXED';

  @IsEnum(['EASY', 'MEDIUM', 'HARD', 'MIXED'])
  @IsOptional()
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';

  @IsNumber()
  @Min(30)
  @Max(3600)
  @IsOptional()
  timeLimit?: number;
}
