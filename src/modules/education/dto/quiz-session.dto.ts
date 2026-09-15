import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
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

/**
 * Body của POST /quizzes/sessions/:sessionId/complete — TẤT CẢ đều optional
 * để client cũ gửi không body vẫn hợp lệ (ValidationPipe biến undefined → {}).
 * `homeworkId` (school platform, Phase 4): hint rằng session này là một BTVN;
 * bridge phía school tự tra nếu thiếu, chỉ dùng khi có nhiều bài giao trùng quiz.
 */
export class CompleteQuizSessionBodyDto {
  @IsOptional()
  @IsUUID()
  homeworkId?: string;
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
