import { IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class AiChatDto {
  @IsString()
  @MinLength(1)
  message: string;

  @IsString()
  @IsOptional()
  conversationId?: string;

  @IsObject()
  @IsOptional()
  context?: {
    lessonId?: string;
    quizSessionId?: string;
  };
}
