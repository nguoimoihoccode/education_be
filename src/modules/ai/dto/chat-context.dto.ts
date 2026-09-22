import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ChatContextDto {
  /** Grounds the reply in a lesson; `Lesson.id` is a uuid column. */
  @IsOptional()
  @IsUUID()
  lessonId?: string;

  @IsOptional()
  @IsString()
  quizSessionId?: string;
}
